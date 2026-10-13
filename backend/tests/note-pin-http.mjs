// Task #126: real HTTP regression tests. Requires PHP/PDO MySQL, a disposable
// local database with migrations 001-004, and backend/dev-router.php on port 8080.
// Only after confirming that the API uses an isolated DEV/TEST database:
// PowerShell: $env:NOTELY_TEST_ISOLATED = '1'; node backend/tests/note-pin-http.mjs
// Optional: NOTELY_TEST_URL and NOTELY_TEST_ORIGIN (the configured PHP origin).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const url = new URL(process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php");
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Use a local disposable DEV/TEST API only.");
assert(["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash,
  "Use an HTTP(S) API URL without credentials, query, or fragment.");
assert.equal(process.env.NOTELY_TEST_ISOLATED, "1",
  "Confirm the local API uses an approved isolated DEV/TEST database, then set NOTELY_TEST_ISOLATED=1. No requests sent.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = `Pin meadow ${randomUUID()}!`;

function client() {
  return {
    cookie: "", csrf: "", registered: false, id: "",
    email: `notely-pin-${randomUUID()}@example.edu`,
    async call(route, body, options = {}) {
      const target = new URL(url);
      target.search = `?route=${route}`;
      const response = await fetch(target, {
        method: options.method || (body === undefined ? "GET" : "POST"),
        headers: {
          Cookie: this.cookie, Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }),
          ...options.headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error", signal: AbortSignal.timeout(10000),
      });
      for (const cookie of response.headers.getSetCookie()) this.cookie = cookie.split(";")[0];
      const data = await response.json();
      if (data.csrfToken) this.csrf = data.csrfToken;
      assert.equal(response.headers.get("cache-control"), "no-store");
      return { status: response.status, data, headers: response.headers };
    },
  };
}

const owner = client();
const other = client();
const anonymous = client();
const noteIds = new Set();
let passed = 0;
function pass(number, description) {
  passed++;
  console.log(`PASS ${number}: ${description}`);
}
function expectError(result, status, message) {
  assert.equal(result.status, status);
  assert.deepEqual(result.data, { error: message });
}
async function read(id, person = owner) {
  const result = await person.call(`note&id=${encodeURIComponent(id)}`);
  assert.equal(result.status, 200);
  return result.data.note;
}
async function pin(id, pinned, person = owner) {
  const result = await person.call("note-pin", { id, pinned });
  assert.equal(result.status, 200);
  assert.equal(result.data.note.pinned, pinned);
  assert.equal((await read(id)).pinned, pinned);
  return result.data.note;
}

try {
  for (const person of [owner, other, anonymous]) {
    const session = await person.call("session");
    assert.equal(session.status, 200, "local PHP/MySQL API must be configured and reachable");
    assert.equal(session.data.user, null);
    assert(person.cookie && person.csrf, "session supplies a cookie and CSRF token");
  }
  for (const [person, name] of [[owner, "Pin Owner"], [other, "Pin Other"]]) {
    const result = await person.call("register", { name, email: person.email, password });
    // Track successful registration before further assertions so cleanup still runs.
    person.registered = result.status === 201;
    assert.equal(result.status, 201);
    person.id = result.data.user.id;
  }
  const create = async (input) => {
    const result = await owner.call("note-create", input);
    if (result.status === 201 && result.data.note?.id) noteIds.add(result.data.note.id);
    assert.equal(result.status, 201);
    return result.data.note;
  };
  const baseline = await create({ title: "Pin regression note", body: "  Lecture notes\nKeep whitespace.  ",
    courseId: "CSE442", lectureDate: "2026-10-11", category: "School", visibility: "shared", tags: ["pin", "lecture"] });
  const second = await create({ title: "Unaffected note", body: "Do not modify this note." });
  const id = baseline.id;
  assert.equal(baseline.pinned, false);

  await pin(id, true);
  pass(1, "owner pin returns 200/true and GET persists true");
  await pin(id, false);
  pass(2, "owner unpin returns 200/false and GET persists false");

  await pin(id, true);
  const oldCookie = owner.cookie;
  const logout = await owner.call("logout", {});
  assert.equal(logout.status, 200);
  assert.equal(logout.data.user, null);
  expectError(await owner.call(`note&id=${id}`), 401, "Sign in to continue.");
  // Use a fresh cookie jar, rather than reusing the logged-out session.
  owner.cookie = "";
  owner.csrf = "";
  assert.equal((await owner.call("session")).status, 200);
  const login = await owner.call("login", { email: owner.email, password });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.id, owner.id);
  assert.notEqual(owner.cookie, oldCookie);
  assert.equal((await read(id)).pinned, true);
  const list = await owner.call("notes");
  assert.equal(list.status, 200);
  assert.equal(list.data.notes.find((note) => note.id === id)?.pinned, true);
  pass(3, "pin survives logout and fresh login in individual note and list");

  // Test every invalid input with both stored states to detect accidental coercion.
  for (const stored of [false, true]) {
    await pin(id, stored);
    for (const input of [{ id, pinned: "true" }, { id, pinned: 1 }, { id, pinned: null }, { id }]) {
      const before = await read(id);
      expectError(await owner.call("note-pin", input), 422, "Choose whether to pin this note.");
      assert.deepEqual(await read(id), before, `invalid input ${JSON.stringify(input)} changes nothing`);
    }
  }
  pass(4, "string, number, null, and missing pinned return 422 without changing either stored state");

  await pin(id, false);
  for (const [person, status, message] of [[other, 403, "You do not have permission to edit this note."],
    [anonymous, 401, "Sign in to continue."]]) {
    const before = await read(id);
    expectError(await person.call("note-pin", { id, pinned: true, ownerId: owner.id }), status, message);
    assert.deepEqual(await read(id), before);
  }
  const invite = await owner.call("note-invite", { id, email: other.email });
  assert.equal(invite.status, 200);
  assert.equal(invite.data.collaborator.id, other.id);
  assert.equal(invite.data.collaborator.permission, "view");
  assert.deepEqual(await read(id, other), await read(id), "viewer can read the fixture");
  const beforeView = await read(id);
  expectError(await other.call("note-pin", { id, pinned: true }), 403, "You do not have permission to edit this note.");
  assert.deepEqual(await read(id), beforeView);
  const permission = await owner.call("note-permission", { id, userId: other.id, permission: "edit" });
  assert.equal(permission.status, 200);
  assert.equal(permission.data.collaborator.permission, "edit");
  await pin(id, true, other);
  await pin(id, false, other);
  pass(5, "owner/editor can pin and unpin; unrelated/view users get 403 and anonymous gets 401");

  const beforeIds = await read(id);
  for (const input of [{ id: "0", pinned: true }, { id: "invalid-id", pinned: true },
    { pinned: true }, { id: 1, pinned: true }]) {
    expectError(await owner.call("note-pin", input), 422, "Choose a valid note.");
    assert.deepEqual(await read(id), beforeIds);
  }
  // Delete our own fixture to obtain a guaranteed absent, valid numeric ID.
  const missing = await create({ title: "Deleted pin fixture" });
  assert.equal((await owner.call("note-delete", { id: missing.id })).status, 200);
  noteIds.delete(missing.id);
  expectError(await owner.call("note-pin", { id: missing.id, pinned: true }), 404, "This note could not be found.");
  assert.deepEqual(await read(id), beforeIds);
  pass(6, "invalid/missing IDs return 422; deleted numeric ID returns 404");

  // MySQL DATETIME has second resolution: wait so a broken timestamp update is observable.
  await delay(1100);
  for (const pinned of [true, false]) {
    assert.deepEqual(await pin(id, pinned), { ...baseline, pinned });
    assert.deepEqual(await read(id), { ...baseline, pinned });
    assert.deepEqual(await read(second.id), second);
  }
  pass(7, "pin/unpin preserve title, body, timestamps, metadata, and another note");

  const beforeSecurity = await read(id);
  for (const [options, status, message] of [
    [{ headers: { "X-CSRF-Token": "forged" } }, 403, "Your session changed. Reload the page and try again."],
    [{ headers: { "X-CSRF-Token": "" } }, 403, "Your session changed. Reload the page and try again."],
    [{ headers: { Origin: "https://attacker.invalid" } }, 403, "This request did not come from your workspace."],
    [{ headers: { "Content-Type": "text/plain" } }, 415, "Send requests as JSON."],
    [{ method: "PUT" }, 405, "This request method is not supported."],
    [{ method: "PATCH" }, 405, "This request method is not supported."],
  ]) {
    const result = await owner.call("note-pin", { id, pinned: true }, options);
    expectError(result, status, message);
    if (status === 405) assert.equal(result.headers.get("allow"), "POST");
    assert.deepEqual(await read(id), beforeSecurity);
  }
  const get = await owner.call("note-pin");
  expectError(get, 405, "This request method is not supported.");
  assert.equal(get.headers.get("allow"), "POST");
  assert.deepEqual(await read(id), beforeSecurity);
  assert.deepEqual(await read(second.id), second);
  pass(8, "CSRF/Origin failures, GET/PUT/PATCH, and text/plain are rejected without mutation");
} catch (error) {
  console.error(`FAIL: ${passed}/8 task tests passed; remaining tests did not complete.`);
  throw error;
} finally {
  // Account deletion cascades owned notes, but attempt explicit note cleanup too.
  if (owner.registered) {
    try {
      const session = await owner.call("session");
      if (!session.data.user) {
        assert.equal((await owner.call("login", { email: owner.email, password })).status, 200);
      }
      for (const id of noteIds) assert.equal((await owner.call("note-delete", { id })).status, 200);
    } catch {
      console.error("Explicit note cleanup failed; attempting account cascade cleanup.");
    }
  }
  for (const person of [owner, other]) {
    if (!person.registered) continue;
    try {
      assert.equal((await person.call("delete", { currentPassword: password })).status, 200);
    } catch {
      process.exitCode = 1;
      console.error(`Account cleanup failed: remove only the temporary account ${person.email} from the isolated database.`);
    }
  }
}
