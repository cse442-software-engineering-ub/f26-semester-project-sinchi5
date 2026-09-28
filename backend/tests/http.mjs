// Real PHP/MySQL contract checks. Creates/deletes only uniquely named test accounts.
// NOTELY_TEST_URL must be the DEV or aptitude API entry point (never cattle).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const endpoint = process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php";
const url = new URL(endpoint);
assert(["localhost", "127.0.0.1", "aptitude.cse.buffalo.edu"].includes(url.hostname), "Run task tests only on DEV or aptitude.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = "Sample meadow password 42!";
const changed = "Changed meadow password 43!";
const recovered = "Recovered meadow password 44!";
const email = `notely-task-${randomUUID()}@example.edu`;
function client() {
  return {
    cookie: "", csrf: "",
    async call(route, body, options = {}) {
      const response = await fetch(`${endpoint}?route=${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { Cookie: this.cookie, Origin: origin, ...(body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }), ...options.headers },
        ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
        redirect: "error",
      });
      for (const cookie of response.headers.getSetCookie()) this.cookie = cookie.split(";")[0];
      const data = await response.json();
      if (data.csrfToken) this.csrf = data.csrfToken;
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert(!JSON.stringify(data).includes("password_hash"));
      assert(!JSON.stringify(data).includes("recovery_code_hash"));
      assert(!JSON.stringify(data).includes("token_hash"));
      return { status: response.status, data, headers: response.headers };
    },
  };
}
const a = client(); const b = client(); const recovery = client();
let currentPassword = password; let exists = false;
try {
  const anonymous = await a.call("session");
  assert.equal(anonymous.data.user, null);
  const cookies = anonymous.headers.getSetCookie().join(";");
  assert.match(cookies, /HttpOnly/i); assert.match(cookies, /SameSite=Lax/i);
  if (url.protocol === "https:") assert.match(cookies, /Secure/i);
  const oldCookie = a.cookie;
  assert.equal((await a.call("register", { name: "Jamie", email, password }, { headers: { "X-CSRF-Token": "forged" } })).status, 403);
  assert.equal((await a.call("register", { name: "Jamie", email, password }, { headers: { Origin: "https://attacker.invalid" } })).status, 403);
  assert.equal((await a.call("register", "not-json")).status, 400);
  assert.equal((await a.call("register", "x".repeat(8200))).status, 413);
  assert.equal((await a.call("register", { name: "Jamie", email, password: "short" })).status, 422);
  const created = await a.call("register", { name: "Jamie", email: ` ${email.toUpperCase()} `, password });
  assert.equal(created.status, 201); exists = true;
  const code = created.data.recoveryCode;
  assert.match(code, /^(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/);
  assert.equal(created.data.user.email, email);
  assert.notEqual(a.cookie, oldCookie);
  assert.equal((await a.call("session")).data.recoveryCode, undefined);
  assert.equal((await a.call("onboarding", {})).data.onboarding.completed, true);
  await b.call("session");
  assert.equal((await b.call("profile", { name: "Intruder", email })).status, 401);
  assert.equal((await b.call("register", { name: "Duplicate", email, password })).status, 409);
  const wrong = await b.call("login", { email, password: "incorrect password" });
  const unknown = await b.call("login", { email: "notely-nonexistent@example.edu", password: "incorrect password" });
  assert.equal(wrong.status, 401); assert.deepEqual(wrong.data, unknown.data);
  assert.equal((await b.call("login", { email, password })).status, 200);
  assert.equal((await a.call("profile", { name: "Changed name", email, currentPassword: "" })).data.user.name, "Changed name");
  assert.equal((await a.call("password", { currentPassword: "incorrect", password: changed })).status, 422);
  assert.equal((await a.call("password", { currentPassword: password, password: changed })).status, 200); currentPassword = changed;
  assert.equal((await b.call("session")).data.user, null);
  await recovery.call("session");
  assert.equal((await recovery.call("reset-password", { email, recoveryCode: "0000-0000-0000-0000-0000-0000-0000-0000", password: recovered })).status, 422);
  const reset = await recovery.call("reset-password", { email, recoveryCode: code.toLowerCase().replaceAll("-", " "), password: recovered });
  assert.equal(reset.status, 200); currentPassword = recovered;
  assert.equal(reset.data.user, null); assert.notEqual(reset.data.recoveryCode, code);
  assert.equal((await a.call("session")).data.user, null);
  assert.equal((await recovery.call("reset-password", { email, recoveryCode: code, password })).status, 422);
  assert.equal((await a.call("login", { email, password: changed })).status, 401);
  assert.equal((await a.call("login", { email, password: recovered })).status, 200);
  const replacement = await a.call("recovery-code", { currentPassword: recovered });
  assert.equal(replacement.status, 200); assert.notEqual(replacement.data.recoveryCode, reset.data.recoveryCode);
  assert.equal((await recovery.call("reset-password", { email, recoveryCode: reset.data.recoveryCode, password })).status, 422);
  const beforeLogout = a.cookie;
  await a.call("logout", {});
  const replay = client(); replay.cookie = beforeLogout;
  assert.equal((await replay.call("session")).data.user, null);
  await a.call("login", { email, password: recovered });
  assert.equal((await a.call("delete", { currentPassword: "incorrect" })).status, 422);
  assert.equal((await a.call("delete", { currentPassword: recovered })).status, 200); exists = false;
  assert.equal((await a.call("login", { email, password: recovered })).status, 401);
  const throttledEmail = `notely-throttle-${randomUUID()}@example.edu`;
  for (let i = 0; i < 20; i++) assert.equal((await a.call("login", { email: throttledEmail, password })).status, 401);
  const limited = await a.call("login", { email: throttledEmail, password });
  assert.equal(limited.status, 429); assert(Number(limited.headers.get("retry-after")) > 0);
  console.log("PASS: PHP account lifecycle, CSRF/origin, cookies, recovery rotation, revocation, validation, and throttling");
} finally {
  if (exists) {
    // Clean up only this run's account, even when a preceding assertion fails.
    try { await a.call("session"); await a.call("logout", {}); await a.call("login", { email, password: currentPassword }); await a.call("delete", { currentPassword }); }
    catch { console.error("Test account cleanup failed; remove the notely-task account created by this run on DEV/TEST."); }
  }
}
