// WP-14: real HTTP tests for theme preferences. Needs a disposable local database with migrations 001-018:
// NOTELY_TEST_ISOLATED=1 NOTELY_TEST_URL=http://127.0.0.1:8141/api/index.php node backend/tests/preferences-http.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = new URL(process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php");
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Use a local disposable DEV/TEST API only.");
assert.equal(process.env.NOTELY_TEST_ISOLATED, "1", "Set NOTELY_TEST_ISOLATED=1 once the API uses a disposable database.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = `Theme meadow ${randomUUID()}!`;

function client() {
  return {
    cookie: "", csrf: "", email: `notely-prefs-${randomUUID()}@example.edu`,
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
  };
}
const a = client(), b = client();
let passed = 0;
const pass = (what) => { passed++; console.log(`PASS ${passed}: ${what}`); };
const err = (r, status, message) => assert.deepEqual([r.status, r.data], [status, { error: message }]);
const defaults = { mode: "system", scheme: "sage", customThemes: [] };

await a.join(); await b.join();
try {
  assert.deepEqual((await a.call("session")).data.preferences, defaults);
  const out = client(); await out.call("session");
  err(await out.call("preferences", defaults), 401, "Sign in to continue.");
  pass("a new student gets system and sage; a signed-out visitor gets 401");
  err(await a.call("preferences"), 405, "This request method is not supported.");
  err(await a.call("preferences", {}, { raw: "x".repeat(9000) }), 413, "This request is too large.");
  pass("GET is 405, an oversized body is 413");
  assert.deepEqual((await a.call("preferences", { mode: "dark", scheme: "mocha" })).data, { preferences: { mode: "dark", scheme: "mocha", customThemes: [] } });
  assert.deepEqual((await a.call("session")).data.preferences, { mode: "dark", scheme: "mocha", customThemes: [] });
  assert.deepEqual((await a.call("preferences", { mode: "light", scheme: "rose" })).data.preferences, { mode: "light", scheme: "rose", customThemes: [] });
  assert.deepEqual((await a.call("session")).data.preferences, { mode: "light", scheme: "rose", customThemes: [] });
  pass("saving then reading back through session, and saving again replaces");
  assert.deepEqual((await b.call("session")).data.preferences, defaults);
  for (const mode of ["system", "light", "dark"]) for (const scheme of ["sage", "fjord", "rose", "mocha"]) {
    assert.equal((await a.call("preferences", { mode, scheme })).status, 200);
  }
  pass("another student is unaffected; all 12 combinations are accepted");
  const modeMsg = "Choose system, light, or dark.", schemeMsg = "Choose sage, fjord, rose, or mocha.";
  for (const [body, msg] of [[{ scheme: "sage" }, modeMsg], [{ mode: "blue", scheme: "sage" }, modeMsg], [{ mode: 1, scheme: "sage" }, modeMsg],
    [{ mode: "dark" }, schemeMsg], [{ mode: "dark", scheme: "neon" }, schemeMsg], [{ mode: "dark", scheme: ["sage"] }, schemeMsg],
    [{ mode: "dark", scheme: "<script>alert(1)</script>'; DROP TABLE notely_preferences; --" }, schemeMsg]]) err(await a.call("preferences", body), 422, msg);
  assert.deepEqual((await a.call("session")).data.preferences, { mode: "dark", scheme: "mocha", customThemes: [] });
  pass("every invalid choice is 422 and nothing is stored");
} finally {
  for (const p of [a, b]) await p.call("delete", { password }).catch(() => {});
}
console.log(`preferences-http: ${passed} groups passed`);
