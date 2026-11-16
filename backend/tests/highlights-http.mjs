// WP-HL: highlights are measured in UTF-16 units and restores drop highlights that no longer fit.
// NOTELY_TEST_ISOLATED=1 NOTELY_TEST_URL=http://127.0.0.1:8141/api/index.php node backend/tests/highlights-http.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = new URL(process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php");
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Use a local disposable DEV/TEST API only.");
assert.equal(process.env.NOTELY_TEST_ISOLATED, "1", "Set NOTELY_TEST_ISOLATED=1 once the API uses a disposable database.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = `Marker meadow ${randomUUID()}!`;
const me = { cookie: "", csrf: "", email: `notely-highlights-${randomUUID()}@example.edu` };
async function call(route, body, query = "") {
  const target = new URL(url);
  target.search = `?route=${route}${query}`;
  const post = body !== undefined;
  const response = await fetch(target, {
    method: post ? "POST" : "GET",
    headers: { Cookie: me.cookie, Origin: origin, ...(post ? { "Content-Type": "application/json", "X-CSRF-Token": me.csrf } : {}) },
    ...(post ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(10000),
  });
  for (const c of response.headers.getSetCookie()) me.cookie = c.split(";")[0];
  const data = await response.json();
  if (data.csrfToken) me.csrf = data.csrfToken;
  return { status: response.status, data };
}
let passed = 0;
const pass = (what) => { passed++; console.log(`PASS ${passed}: ${what}`); };
const outside = { error: "Highlights must be inside the note." };

await call("session");
assert.equal((await call("register", { name: "Casey", email: me.email, password })).status, 201);
await call("session");
try {
  const body = "Exam day \u{1F389} bring a calculator";
  const start = body.indexOf("calculator"); // UTF-16 units, like the browser's selectionStart
  const end = start + "calculator".length;
  const made = await call("note-create", { title: "Emoji", body });
  const id = made.data.note.id;
  const saved = await call("note-save", { id, title: "Emoji", body, highlights: [{ start, end, color: "yellow" }] });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data.note.highlights, [{ start, end, color: "yellow" }]);
  assert.equal(end, [...body].length + 1); // the emoji is 2 units but 1 character: the old check refused this
  pass("a highlight on the word after an emoji is saved (UTF-16 positions)");
  for (const bad of [{ start, end: end + 1 }, { start: end, end: end + 1 }, { start: 3, end: 3 }, { start: -1, end: 2 }]) {
    const r = await call("note-save", { id, title: "Emoji", body, highlights: [{ ...bad, color: "green" }] });
    assert.deepEqual([r.status, r.data], [422, outside]);
  }
  assert.deepEqual((await call("note", undefined, `&id=${id}`)).data.note.highlights, [{ start, end, color: "yellow" }]);
  pass("a highlight past the end (in UTF-16 units) is still refused with the same message and nothing changes");
  // Restoring a shorter version drops highlights that no longer fit and keeps the ones that do.
  const note = (await call("note-create", { title: "Restore", body: "Alpha" })).data.note.id;
  const longer = "Alpha beta gamma delta";
  const highlights = [{ start: 0, end: 5, color: "pink" }, { start: 17, end: 22, color: "green" }];
  assert.equal((await call("note-save", { id: note, title: "Restore", body: longer, highlights })).status, 200);
  const versions = (await call("note-versions", undefined, `&id=${note}`)).data.versions;
  const alpha = versions.find((v) => v.body === "Alpha");
  const restored = await call("note-restore", { id: note, versionId: alpha.id });
  assert.equal(restored.status, 200);
  assert.deepEqual([restored.data.note.body, restored.data.note.highlights], ["Alpha", [{ start: 0, end: 5, color: "pink" }]]);
  assert.deepEqual((await call("note", undefined, `&id=${note}`)).data.note.highlights, [{ start: 0, end: 5, color: "pink" }]);
  pass("restoring a shorter version drops highlights past its end and keeps the ones that fit");
  const back = (await call("note-versions", undefined, `&id=${note}`)).data.versions.find((v) => v.body === longer);
  assert.deepEqual((await call("note-restore", { id: note, versionId: back.id })).data.note.highlights, [{ start: 0, end: 5, color: "pink" }]);
  pass("restoring the longer version again does not bring the dropped highlight back");
} finally {
  await call("delete", { password }).catch(() => {});
}
console.log(`highlights-http: ${passed} groups passed`);
