// HTTP contract for card 110. Run only against a DEV/TEST API with migrations 002 and 003 applied.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php";
const url = new URL(endpoint);
assert(["localhost", "127.0.0.1", "aptitude.cse.buffalo.edu"].includes(url.hostname), "Run note tests only on DEV or TEST.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = "Sample meadow password 42!";

function client() {
  return {
    cookie: "", csrf: "", registered: false,
    async call(route, body, headers = {}) {
      const response = await fetch(`${endpoint}?route=${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: this.cookie,
          Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
      });
      for (const cookie of response.headers.getSetCookie()) this.cookie = cookie.split(";")[0];
      const data = await response.json();
      if (data.csrfToken) this.csrf = data.csrfToken;
      assert.equal(response.headers.get("cache-control"), "no-store");
      return { status: response.status, data };
    },
  };
}

const owner = client();
const other = client();
const anonymous = client();
try {
  for (const person of [owner, other, anonymous]) await person.call("session");
  for (const [person, name] of [[owner, "Owner"], [other, "Other"]]) {
    assert.equal((await person.call("register", {
      name, email: `notely-content-${randomUUID()}@example.edu`, password,
    })).status, 201);
    person.registered = true;
  }
  const created = await owner.call("note-create", { title: "CSE 442 Notes" });
  assert.equal(created.status, 201);
  const id = created.data.note.id;
  const read = async () => {
    const result = await owner.call(`note&id=${id}`);
    assert.equal(result.status, 200);
    // GET note returns the whole note since card 120; these checks cover its text.
    const { id: noteId, title, body } = result.data.note;
    return { id: noteId, title, body };
  };
  assert.deepEqual(await read(), { id, title: "CSE 442 Notes", body: "" });
  assert.equal((await owner.call("note-content", { id, body: "Original body" })).status, 200);
  assert.equal((await read()).body, "Original body");
  assert.equal((await other.call("note-content", {
    id, body: "Intruder", owner_user_id: created.data.note.id, permission: "edit",
  })).status, 403);
  assert.equal((await other.call(`note&id=${id}`)).status, 404);
  assert.equal((await read()).body, "Original body");
  const body = " \tUpdated content\r\n\u{1F600}\u{00E9} \n";
  const updated = await owner.call("note-content", { id, body, title: "Ignored title" });
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.data, { note: { id, body } });
  assert.deepEqual(await read(), { id, title: "CSE 442 Notes", body });
  assert.equal((await anonymous.call("note-content", { id, body: "Anonymous" })).status, 401);
  assert.equal((await owner.call("note-content", { id, body: "CSRF" }, { "X-CSRF-Token": "forged" })).status, 403);
  assert.equal((await owner.call("note-content", { id, body: "Origin" }, { Origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await owner.call("note-content", { id, body: "Type" }, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await owner.call("note-content")).status, 405);
  for (const input of [{ id }, { id, body: null }, { id, body: 1 }, { id, body: false }, { id, body: [] }, { id: "0", body: "Bad ID" }]) {
    assert.equal((await owner.call("note-content", input)).status, 422);
  }
  const missing = "9999999999999999999";
  assert.equal((await owner.call("note-content", { id: missing, body: "Ghost" })).status, 404);
  assert.equal((await owner.call(`note&id=${missing}`)).status, 404);
  assert.equal((await owner.call("note-content", { id, body: "x".repeat(8200) })).status, 413);
  assert.deepEqual(await read(), { id, title: "CSE 442 Notes", body });
  const largeBody = "x".repeat(8000);
  assert.equal((await owner.call("note-content", { id, body: largeBody })).status, 200);
  assert.equal((await read()).body, largeBody);
  assert.equal((await owner.call("note-content", { id, body: "" })).status, 200);
  assert.deepEqual(await read(), { id, title: "CSE 442 Notes", body: "" });
  console.log("PASS: card 110 HTTP persistence, title preservation, ownership, validation, CSRF/origin, request limits");
} finally {
  for (const person of [owner, other]) {
    if (!person.registered) continue;
    try {
      assert.equal((await person.call("delete", { currentPassword: password })).status, 200);
    } catch {
      console.error("Test account cleanup failed; remove the notely-content account created by this run on DEV/TEST.");
    }
  }
}

