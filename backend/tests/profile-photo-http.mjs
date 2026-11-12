// Card 160: local, disposable DEV only. Requires all migrations and matching NOTELY_CONFIG.
// NOTELY_TEST_PHP may name PHP when it is not on PATH. No GD or intl required.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const endpoint = new URL(process.env.NOTELY_TEST_URL || "http://127.0.0.1:8081/api/index.php");
assert(["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname), "Use a local disposable DEV API only.");
assert(["http:", "https:"].includes(endpoint.protocol) && !endpoint.username && !endpoint.password
  && !endpoint.search && !endpoint.hash, "Use an HTTP(S) URL without credentials, query, or fragment.");
assert.equal(process.env.NOTELY_TEST_ISOLATED, "1", "Confirm an isolated DEV database before running these tests.");
const origin = process.env.NOTELY_TEST_ORIGIN || endpoint.origin;
const password = `Photo meadow ${randomUUID()}!`;
const fixture = (name) => readFileSync(new URL(`data/${name}`, import.meta.url));
const png = fixture("photo-64.png");
const sizeError = "Profile pictures can be at most 2 MB.";
const readError = "This image could not be read. Try another file.";
const typeError = "Choose a PNG, JPEG, or WebP image.";
const noPhoto = "No profile photo yet.";
function client() {
  return {
    cookie: "", csrf: "", registered: false, id: "",
    email: `notely-photo-${randomUUID()}@example.edu`,
    async call(route, body, options = {}) {
      const url = new URL(endpoint);
      url.search = `?route=${route}`;
      const response = await fetch(url, {
        method: options.method || (body === undefined ? "GET" : "POST"),
        headers: { Cookie: this.cookie, Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }),
          ...options.headers },
        ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
        redirect: "error", signal: AbortSignal.timeout(15000),
      });
      for (const cookie of response.headers.getSetCookie()) this.cookie = cookie.split(";")[0];
      const bytes = Buffer.from(await response.arrayBuffer());
      const data = response.headers.get("content-type")?.startsWith("application/json")
        ? JSON.parse(bytes.toString()) : null;
      if (data?.csrfToken) this.csrf = data.csrfToken;
      return { status: response.status, headers: response.headers, data, bytes };
    },
  };
}
function error(result, status, message) {
  assert.equal(result.status, status);
  // Exact JSON also catches warnings, paths, or stack traces appended to errors.
  assert.deepEqual(result.data, { error: message });
  assert.deepEqual(JSON.parse(result.bytes.toString()), { error: message });
}
function photoCount(user, expected) {
  const result = execFileSync(process.env.NOTELY_TEST_PHP || "php", [
    fileURLToPath(new URL("profile-photo-storage.php", import.meta.url)), user.id, user.email,
  ], { encoding: "utf8", env: process.env });
  assert.equal(result.trim(), String(expected), "database row count for this test account");
}
const owner = client(), other = client(), anonymous = client();
const accounts = [owner, other];
let complete = false;
try {
  for (const user of accounts) {
    assert.equal((await user.call("session")).status, 200);
    const created = await user.call("register", { name: "Photo Student", email: user.email, password });
    assert.equal(created.status, 201);
    user.registered = true;
    user.id = created.data.user.id;
    assert.equal(created.data.user.hasPhoto, false);
  }
  error(await owner.call("profile-photo"), 404, noPhoto);
  // Test 1: every format replaces the same row and preserves the original bytes.
  let saved;
  for (const [name, mime] of [["photo-64.png", "image/png"], ["photo-64.jpg", "image/jpeg"], ["photo-64.webp", "image/webp"]]) {
    saved = fixture(name);
    const uploaded = await owner.call("profile-photo", { content: saved.toString("base64"), userId: other.id });
    assert.equal(uploaded.status, 200);
    assert.equal(uploaded.data.user.hasPhoto, true);
    assert.equal((await owner.call("session")).data.user.hasPhoto, true);
    const read = await owner.call("profile-photo");
    assert.equal(read.status, 200);
    assert.equal(read.headers.get("content-type"), mime);
    assert.equal(read.headers.get("x-content-type-options"), "nosniff");
    assert.equal(read.headers.get("content-disposition"), "inline");
    assert.equal(read.headers.get("cache-control"), "private, no-cache");
    assert.deepEqual(read.bytes, saved);
    photoCount(owner, 1);
  }
  console.log("PASS 1: PNG, JPEG, WebP uploads, replacement, session flag, headers, and exact bytes");

  // Test 2: validate before writing, so every failed upload preserves the saved photo.
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  for (const [body, message] of [
    [{ content: fixture("fake-photo.png").toString("base64") }, typeError],
    [{ content: gif.toString("base64") }, typeError],
    [{ content: "%%%" }, readError], [{ content: "" }, readError],
    [{ content: fixture("photo-16.png").toString("base64") }, readError],
    [{ content: png.subarray(0, 12).toString("base64") }, readError],
    ...["photo-64.png", "photo-64.jpg", "photo-64.webp"].map((name) => [
      { content: fixture(name).subarray(0, -2).toString("base64") }, readError,
    ]),
    [{}, readError], [{ content: null }, readError], [{ content: 42 }, readError],
    [{ content: ["abc"] }, readError],
  ]) {
    error(await owner.call("profile-photo", body), 422, message);
    assert.deepEqual((await owner.call("profile-photo")).bytes, saved);
  }
  error(await owner.call("profile-photo", "{broken"), 400, "Send a valid JSON object.");
  console.log("PASS 2: invalid types, base64, content, dimensions, and headers preserve the saved photo");

  // Test 3: bounded deterministic allocations, below Node's default memory limit.
  const oversized = Buffer.alloc(2 * 1024 * 1024 + 1);
  png.copy(oversized);
  error(await owner.call("profile-photo", { content: oversized.toString("base64") }), 413, sizeError);
  error(await owner.call("profile-photo", { content: "A".repeat(3 * 1024 * 1024) }), 413, sizeError);
  assert.deepEqual((await owner.call("profile-photo")).bytes, saved);
  console.log("PASS 3: decoded and request size limits return exact errors without changing storage");

  // Test 4: authentication, CSRF, ownership, persistence, removal, and actual FK cascade.
  for (const user of [anonymous, other]) {
    error(await user.call(`profile-photo&user_id=${owner.id}`), user === anonymous ? 401 : 404,
      user === anonymous ? "Sign in to continue." : noPhoto);
  }
  for (const route of ["profile-photo", "profile-photo-remove"]) {
    error(await anonymous.call(route, { content: png.toString("base64") }), 401, "Sign in to continue.");
    error(await owner.call(route, {}, { headers: { "X-CSRF-Token": "forged" } }), 403,
      "Your session changed. Reload the page and try again.");
    error(await owner.call(route, {}, { headers: { Origin: "http://untrusted.invalid" } }), 403,
      "This request did not come from your workspace.");
  }
  const oldCookie = owner.cookie;
  assert.equal((await owner.call("logout", {})).status, 200);
  error(await owner.call("profile-photo"), 401, "Sign in to continue.");
  const stale = client(); stale.cookie = oldCookie;
  error(await stale.call("profile-photo"), 401, "Sign in to continue.");
  const login = await owner.call("login", { email: owner.email, password });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.hasPhoto, true);
  assert.deepEqual((await owner.call("profile-photo")).bytes, saved);
  assert.equal((await other.call("profile-photo-remove", { user_id: owner.id })).status, 200);
  assert.deepEqual((await owner.call("profile-photo")).bytes, saved);
  const removed = await owner.call("profile-photo-remove", {});
  assert.equal(removed.status, 200);
  assert.equal(removed.data.user.hasPhoto, false);
  assert.equal((await owner.call("session")).data.user.hasPhoto, false);
  error(await owner.call("profile-photo"), 404, noPhoto);
  photoCount(owner, 0);
  assert.equal((await owner.call("profile-photo-remove", {})).status, 200);
  assert.equal((await owner.call("profile-photo", { content: png.toString("base64") })).status, 200);
  photoCount(owner, 1);
  assert.equal((await owner.call("delete", { currentPassword: password })).status, 200);
  owner.registered = false;
  photoCount(owner, 0);
  console.log("PASS 4: authentication, CSRF, ownership, relogin, removal, and account deletion cascade");

  // Test 5: ordinary JSON limits and profile updates still work.
  error(await other.call("profile", { name: "A".repeat(9000) }), 413, "This request is too large.");
  assert.equal((await other.call("profile", { name: "Updated Student", email: other.email })).status, 200);
  assert.equal((await other.call("session")).data.user.name, "Updated Student");
  error(await other.call("profile-photo", undefined, { method: "PUT" }), 405, "This request method is not supported.");
  error(await other.call("profile-photo-remove"), 405, "This request method is not supported.");
  complete = true;
} finally {
  // Attempt all cleanups even if one fails; never hide cleanup errors behind PASS.
  const cleanup = await Promise.allSettled(accounts.filter((user) => user.registered).map(async (user) => {
    assert.equal((await user.call("delete", { currentPassword: password })).status, 200);
    user.registered = false;
  }));
  for (const result of cleanup) if (result.status === "rejected") throw result.reason;
}
if (complete) console.log("PASS: profile photos are checked, stored, served safely, and removed");
