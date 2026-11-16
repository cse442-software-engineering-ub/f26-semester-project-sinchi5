// Card 229: real HTTP tests for custom themes. Needs a disposable local database with migrations 001-018:
// NOTELY_TEST_ISOLATED=1 NOTELY_TEST_URL=http://127.0.0.1:8229/api/index.php node backend/tests/custom-themes-http.mjs
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
const dusk = { name: "Dusk", accent: "#336699", background: "#fafafa", text: "#222222" };
const colorMsg = "Colors must look like #1a2b3c.", nameMsg = "Give the theme a name of 1 to 30 characters.";
const missing = "This theme was not found.", schemeMsg = "Choose sage, fjord, rose, or mocha.";

await a.join(); await b.join();
try {
  assert.deepEqual(await a.prefs(), { mode: "system", scheme: "sage", customThemes: [] });
  const out = client(); await out.call("session");
  assert.deepEqual((await out.call("session")).data.preferences, { mode: "system", scheme: "sage", customThemes: [] });
  for (const route of ["theme-save", "theme-delete"]) {
    err(await out.call(route, dusk), 401, "Sign in to continue.");
    err(await a.call(route), 405, "This request method is not supported.");
    err(await a.call(route, {}, { raw: "x".repeat(9000) }), 413, "This request is too large.");
    const csrf = a.csrf; a.csrf = "wrong";
    assert.equal((await a.call(route, dusk)).status, 403);
    a.csrf = csrf;
  }
  pass("defaults carry an empty list; signed out is 401, GET 405, oversized 413, a wrong CSRF token 403");

  const made = (await a.call("theme-save", { ...dusk, accent: "#3366AA" })).data.preferences;
  const id = made.customThemes[0].id;
  assert.match(id, /^[0-9a-f]{8}$/);
  assert.deepEqual(made, { mode: "system", scheme: "sage", customThemes: [{ id, ...dusk, accent: "#3366aa" }] });
  assert.deepEqual(await a.prefs(), made);
  pass("a saved theme comes back with a server-made id, lowercased colors, and is in the session");

  const changed = (await a.call("theme-save", { id, name: "  Dawn  ", accent: "#aa3366", background: "#101010", text: "#eeeeee" })).data.preferences;
  assert.deepEqual(changed.customThemes, [{ id, name: "Dawn", accent: "#aa3366", background: "#101010", text: "#eeeeee" }]);
  assert.deepEqual((await a.call("preferences", { mode: "dark", scheme: `custom:${id}` })).data.preferences, { ...changed, mode: "dark", scheme: `custom:${id}` });
  assert.deepEqual((await a.call("theme-save", { id, ...dusk })).data.preferences, { mode: "dark", scheme: `custom:${id}`, customThemes: [{ id, ...dusk }] });
  pass("saving with an id updates in place; the theme can be selected and stays selected through an update");

  const before = await a.prefs();
  for (const bad of ["red", "#fff", "#12345g", "#123456;}body{display:none", "#1234567", "123456", " #123456", "#123456\n", "", null, 123456, ["#123456"], { hex: "#123456" }]) {
    for (const key of ["accent", "background", "text"]) err(await a.call("theme-save", { ...dusk, [key]: bad }), 422, colorMsg);
  }
  err(await a.call("theme-save", { name: "Dusk" }), 422, colorMsg);
  for (const bad of ["", "   ", "x".repeat(31), "a\u0000b", "a​b", "line\nbreak", null, 5, ["Dusk"]]) err(await a.call("theme-save", { ...dusk, name: bad }), 422, nameMsg);
  err(await a.call("theme-save", { accent: "#336699", background: "#fafafa", text: "#222222" }), 422, nameMsg);
  assert.deepEqual(await a.prefs(), before);
  pass("every bad color and name is 422 and nothing is stored");

  const script = "<script>alert(1)</script>";
  const xss = (await a.call("theme-save", { ...dusk, name: script })).data.preferences.customThemes;
  assert.equal(xss[1].name, script);
  assert.equal((await a.call("theme-save", { ...dusk, name: "é".repeat(30) })).data.preferences.customThemes[2].name, "é".repeat(30));
  const sql = "'; DROP TABLE notely_users; --";
  assert.equal((await a.call("theme-save", { ...dusk, name: sql })).data.preferences.customThemes[3].name, sql);
  const full = await a.prefs();
  assert.equal(full.customThemes.length, 4);
  err(await a.call("theme-save", dusk), 422, "You can save up to four themes. Delete one to add another.");
  assert.equal((await a.call("theme-save", { id, ...dusk, name: "Still editable" })).status, 200);
  assert.equal((await a.prefs()).customThemes.length, 4);
  pass("script and SQL text come back as plain text; a fifth theme is refused but the four can still be edited");

  const theirs = (await b.call("theme-save", { ...dusk, name: "Mine" })).data.preferences.customThemes[0].id;
  const bBefore = await b.prefs();
  err(await a.call("theme-save", { id: theirs, ...dusk }), 404, missing);
  err(await a.call("theme-delete", { id: theirs }), 404, missing);
  err(await a.call("preferences", { mode: "dark", scheme: `custom:${theirs}` }), 422, schemeMsg);
  for (const bad of [{}, { id: "nope" }, { id: 7 }, { id: [id] }, { id: null }]) err(await a.call("theme-delete", bad), 404, missing);
  for (const scheme of ["custom:", "custom:nope", `custom:${id} `, `CUSTOM:${id}`]) err(await a.call("preferences", { mode: "dark", scheme }), 422, schemeMsg);
  assert.deepEqual(await b.prefs(), bBefore);
  assert.equal((await a.prefs()).scheme, `custom:${id}`);
  pass("another student's theme cannot be updated, deleted or selected; unknown ids are 404");

  const other = full.customThemes[1].id;
  assert.deepEqual((await a.call("theme-delete", { id: other })).data.preferences.scheme, `custom:${id}`);
  const after = (await a.call("theme-delete", { id })).data.preferences;
  assert.deepEqual([after.mode, after.scheme, after.customThemes.length], ["dark", "sage", 2]);
  assert.deepEqual(await a.prefs(), after);
  err(await a.call("theme-delete", { id }), 404, missing);
  assert.equal((await a.call("theme-save", dusk)).data.preferences.customThemes.length, 3);
  pass("deleting another theme keeps the choice; deleting the selected one falls back to sage and frees a slot");
} finally {
  for (const p of [a, b]) await p.call("delete", { password }).catch(() => {});
}
console.log(`custom-themes-http: ${passed} groups passed`);
