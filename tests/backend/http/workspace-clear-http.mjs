// WP-12: workspace-clear removes one student's workspace in one request. Needs a disposable local database
// with migrations 001-017: NOTELY_TEST_ISOLATED=1 NOTELY_TEST_URL=http://127.0.0.1:8141/api/index.php node tests/backend/http/workspace-clear-http.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = new URL(process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php");
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Use a local disposable DEV/TEST API only.");
assert.equal(process.env.NOTELY_TEST_ISOLATED, "1", "Set NOTELY_TEST_ISOLATED=1 once the API uses a disposable database.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = `Clear meadow ${randomUUID()}!`;

function client() {
  return {
    cookie: "", csrf: "", email: `notely-clear-${randomUUID()}@example.edu`,
    async call(route, body, { raw, method, query = "" } = {}) {
      const target = new URL(url);
      target.search = `?route=${route}${query}`;
      const post = body !== undefined;
      const response = await fetch(target, {
        method: method ?? (post ? "POST" : "GET"),
        headers: { Cookie: this.cookie, Origin: origin, ...(post ? { "Content-Type": "application/json", "X-CSRF-Token": this.csrf } : {}) },
        ...(post ? { body: raw ?? JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(10000),
      });
      for (const c of response.headers.getSetCookie()) this.cookie = c.split(";")[0];
      const data = await response.json();
      if (data.csrfToken) this.csrf = data.csrfToken;
      return { status: response.status, data };
    },
    async join() {
      await this.call("session");
      assert.equal((await this.call("register", { name: "Casey", email: this.email, password })).status, 201);
      await this.call("session");
    },
  };
}
const a = client(), b = client();
let passed = 0;
const pass = (what) => { passed++; console.log(`PASS ${passed}: ${what}`); };
const err = (r, status, message) => assert.deepEqual([r.status, r.data], [status, { error: message }]);
const course = { code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const event = { courseId: "clear-c", title: "Study group", kind: "other", date: "2026-11-20", time: "14:30", location: "", description: "" };

// Gives a student a note with a version, a course with an event, a syllabus upload, and (when friends are given) a course share.
async function fill(person, courseId) {
  assert.equal((await person.call("course-save", { ...course, id: courseId })).status, 200);
  assert.equal((await person.call("event-save", { ...event, courseId })).status, 201);
  const note = (await person.call("note-create", { title: "Lecture", body: "one", courseId, visibility: "shared" })).data.note.id;
  assert.equal((await person.call("note-save", { id: note, title: "Lecture", body: "two" })).status, 200);
  assert.equal((await person.call("note-comment", { id: note, body: "hello" })).status, 200);
  const up = await person.call("syllabus-upload", { courseId, fileName: "s.txt", content: Buffer.from("syllabus").toString("base64") });
  assert.equal(up.status, 201);
  return note;
}
const counts = async (person, note) => [
  (await person.call("notes")).data.notes.length, (await person.call("courses")).data.courses.length, (await person.call("events")).data.events.length,
  note ? (await person.call("note-versions", undefined, { query: `&id=${note}` })).status : 0,
];

await a.join(); await b.join();
try {
  const out = client(); await out.call("session");
  err(await out.call("workspace-clear", { confirm: "CLEAR" }), 401, "Sign in to continue.");
  err(await a.call("workspace-clear"), 405, "This request method is not supported.");
  err(await a.call("workspace-clear", {}, { raw: JSON.stringify({ confirm: "x".repeat(9000) }) }), 413, "This request is too large.");
  pass("signed out is 401, GET is 405, an oversized body is 413");

  const noteA = await fill(a, "clear-c");
  const noteB = await fill(b, "clear-d"); // a second student with their own data
  assert.equal((await a.call("friend-request", { email: b.email })).status, 201);
  const incoming = (await b.call("friends")).data.incoming[0];
  assert.equal((await b.call("friend-respond", { id: incoming.id, accept: true })).status, 200);
  // Card 246: only an accepted friend can be invited.
  assert.equal((await a.call("note-invite", { id: noteA, email: b.email })).status, 200);
  assert.equal((await a.call("course-notes-share", { courseId: "clear-c", courseCode: "CSE 442", friendIds: [(await a.call("friends")).data.friends[0].userId] })).status, 200);
  assert.deepEqual(await counts(a, noteA), [1, 1, 1, 200]);
  assert.equal((await b.call("note", undefined, { query: `&id=${noteA}` })).status, 200); // b is a collaborator on a's note

  // Anything but the exact word is refused and removes nothing.
  for (const confirm of [undefined, "", "clear", "CLEAR ", " CLEAR", "Clear", true, ["CLEAR"], "CLEAR'; DROP TABLE notely_notes; --"]) {
    err(await a.call("workspace-clear", confirm === undefined ? {} : { confirm }), 422, "Type CLEAR to confirm.");
  }
  assert.deepEqual(await counts(a, noteA), [1, 1, 1, 200]);
  pass("anything other than the exact word CLEAR is 422 and nothing is removed");

  assert.deepEqual((await a.call("workspace-clear", { confirm: "CLEAR" })).data, { cleared: true });
  assert.deepEqual(await counts(a, noteA), [0, 0, 0, 404]);
  assert.deepEqual((await a.call("course-notes-shares", undefined, { query: "&courseId=clear-c" })).data, { shares: [] });
  assert.equal((await a.call("session")).data.user.email, a.email);
  assert.equal((await a.call("friends")).data.friends.length, 1);
  pass("clearing removes notes (and their versions), courses, events and shares, and keeps the account and friends");

  // Import jobs: the upload made above is gone.
  const jobs = await a.call("syllabus-upload", { courseId: "clear-c", fileName: "s2.txt", content: Buffer.from("syllabus").toString("base64") });
  assert.equal((await a.call("workspace-clear", { confirm: "CLEAR" })).status, 200);
  assert.deepEqual((await a.call("import-job", undefined, { query: `&id=${jobs.data.job.id}` })).status, 404);
  pass("import jobs are removed; clearing an empty workspace works again");

  // The other student keeps everything, including the note a collaborated on and a's friend link.
  assert.deepEqual(await counts(b, noteB), [1, 1, 1, 200]);
  assert.equal((await b.call("note", undefined, { query: `&id=${noteA}` })).status, 404);
  assert.equal((await b.call("friends")).data.friends.length, 1);
  pass("another student's notes, courses, events and uploads are untouched");

  // List sizes: clear a workspace with many notes.
  for (let i = 0; i < 25; i++) assert.equal((await a.call("note-create", { title: `n${i}`, body: "x" })).status, 201);
  assert.equal((await a.call("notes")).data.notes.length, 25);
  assert.equal((await a.call("workspace-clear", { confirm: "CLEAR" })).status, 200);
  assert.equal((await a.call("notes")).data.notes.length, 0);
  pass("a workspace with 25 notes clears in one request");
} finally {
  for (const p of [a, b]) await p.call("delete", { currentPassword: password }).catch(() => {});
}
console.log(`workspace-clear-http: ${passed} groups passed`);
