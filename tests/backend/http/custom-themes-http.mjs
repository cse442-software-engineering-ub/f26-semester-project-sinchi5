// Card 224: real HTTP tests for custom themes. Needs a disposable local database with migrations 001-018:
// NOTELY_TEST_ISOLATED=1 NOTELY_TEST_URL=http://127.0.0.1:8224/api/index.php node tests/backend/http/custom-themes-http.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = new URL(process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php");
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Use a local disposable DEV/TEST API only.");
assert.equal(process.env.NOTELY_TEST_ISOLATED, "1", "Set NOTELY_TEST_ISOLATED=1 once the API uses a disposable database.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = `Theme meadow ${randomUUID()}!`;

function client() {
  return {
    cookie: "", csrf: "", email: `notely-themes-${randomUUID()}@example.edu`,
    async call(route, body, { raw, method } = {}) {
      const target = new URL(url);
      target.search = `?route=${route}`;
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
    async prefs() { return (await this.call("session")).data.preferences; },
  };
}
const a = client(), b = client();
let passed = 0;
const pass = (what) => { passed++; console.log(`PASS ${passed}: ${what}`); };
const err = (r, status, message) => assert.deepEqual([r.status, r.data], [status, { error: message }]);
const good = { name: "Dusk", accent: "#AA5533", background: "#101820", text: "#EEEEEE" };
const colorMsg = "Use a color like #1a2b3c for the accent, background, and text.";
const nameMsg = "Enter a theme name of 1 to 30 visible characters.";

await a.join(); await b.join();
try {
  assert.deepEqual(await a.prefs(), { mode: "system", scheme: "sage", customThemes: [] });
  const out = client(); await out.call("session");
  err(await out.call("theme-save", good), 401, "Sign in to continue.");
  err(await out.call("theme-delete", { id: "0123456789abcdef" }), 401, "Sign in to continue.");
  err(await a.call("theme-save"), 405, "This request method is not supported.");
  err(await a.call("theme-delete", {}, { raw: "x".repeat(9000) }), 413, "This request is too large.");
  pass("defaults are an empty list; signed out is 401, GET is 405, an oversized body is 413");

  const saved = (await a.call("theme-save", good)).data.preferences.customThemes;
  assert.equal(saved.length, 1);
  const id = saved[0].id;
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.deepEqual(saved[0], { id, name: "Dusk", accent: "#aa5533", background: "#101820", text: "#eeeeee" });
  assert.deepEqual((await a.prefs()).customThemes, saved);
  const updated = (await a.call("theme-save", { ...good, id, name: "Dusk 2", accent: "#112233" })).data.preferences.customThemes;
  assert.deepEqual(updated, [{ id, name: "Dusk 2", accent: "#112233", background: "#101820", text: "#eeeeee" }]);
  pass("save returns a server id and lowercase colors; saving with the id updates in place");

  for (const bad of ["red", "#fff", "#12345g", "#123456;}body{display:none", "#1234567", " #123456", 123456, null, ["#123456"]]) {
    for (const key of ["accent", "background", "text"]) err(await a.call("theme-save", { ...good, [key]: bad }), 422, colorMsg);
  }
  for (const name of ["", "   ", "x".repeat(31), 5, null, "Bell\u0007"]) err(await a.call("theme-save", { ...good, name }), 422, nameMsg);
  err(await a.call("theme-save", { ...good, id: "not-an-id" }), 422, "Choose one of your own themes to change.");
  err(await a.call("theme-delete", {}), 422, "Choose a theme to delete.");
  assert.deepEqual((await a.prefs()).customThemes, updated);
  pass("bad colors, names, and ids are 422 and nothing is stored");

  const script = "<script>alert(1)</script>'; DROP TABLE x; --".slice(0, 30);
  assert.equal((await a.call("theme-save", { ...good, name: script })).data.preferences.customThemes[1].name, script);
  for (let i = 0; i < 2; i++) assert.equal((await a.call("theme-save", good)).status, 200);
  err(await a.call("theme-save", good), 422, "You can save up to 4 themes. Delete one to add another.");
  assert.equal((await a.call("theme-save", { ...good, id })).data.preferences.customThemes.length, 4);
  pass("a script name comes back as plain text; a fifth theme is refused and updating at four still works");

  err(await b.call("theme-save", { ...good, id }), 404, "That theme was not found.");
  err(await b.call("theme-delete", { id }), 404, "That theme was not found.");
  err(await b.call("preferences", { mode: "dark", scheme: `custom:${id}` }), 422, "Choose sage, fjord, rose, or mocha.");
  assert.deepEqual(await b.prefs(), { mode: "system", scheme: "sage", customThemes: [] });
  assert.equal((await a.prefs()).customThemes.length, 4);
  pass("another student's theme cannot be updated, deleted, or selected");

  const own = await a.call("preferences", { mode: "dark", scheme: `custom:${id}` });
  assert.equal(own.data.preferences.scheme, `custom:${id}`);
  err(await a.call("preferences", { mode: "dark", scheme: "custom:ffffffffffffffff" }), 422, "Choose sage, fjord, rose, or mocha.");
  const after = await a.call("theme-delete", { id });
  assert.equal(after.data.preferences.scheme, "sage");
  assert.equal(after.data.preferences.mode, "dark");
  assert.equal(after.data.preferences.customThemes.length, 3);
  err(await a.call("theme-delete", { id }), 404, "That theme was not found.");
  pass("an own theme can be selected; deleting the selected one falls back to sage");
} finally {
  for (const p of [a, b]) await p.call("delete", { password }).catch(() => {});
}
console.log(`custom-themes-http: ${passed} groups passed`);
