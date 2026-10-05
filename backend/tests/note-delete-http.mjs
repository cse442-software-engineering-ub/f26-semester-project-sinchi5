// HTTP contract for card 116. Run only against a DEV/TEST API with migrations 002 and 003 applied.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php";
const url = new URL(endpoint);
assert(["localhost", "127.0.0.1", "aptitude.cse.buffalo.edu"].includes(url.hostname), "Run note tests only on DEV or TEST.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = "Sample meadow password 42!";

function client() {
  return {
    cookie: "", csrf: "", registered: false, id: "",
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
    const registered = await person.call("register", {
      name, email: `notely-delete-${randomUUID()}@example.edu`, password,
    });
    assert.equal(registered.status, 201);
    person.registered = true;
    person.id = registered.data.user.id;
  }
  const create = async (title) => {
    const created = await owner.call("note-create", { title });
    assert.equal(created.status, 201);
    return created.data.note.id;
  };
  const status = async (id) => (await owner.call(`note&id=${id}`)).status;

  // Task test 1: the owner deletes their own note.
  const owned = await create("Owner's note");
  const deleted = await owner.call("note-delete", { id: owned });
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.data, { note: { id: owned } });
  assert.equal(await status(owned), 404);
  assert.equal((await owner.call("note-delete", { id: owned })).status, 404);

  // Task test 3: signed-out, non-owner with a forged owner ID, CSRF, Origin, and method checks.
  const kept = await create("Group project plan");
  assert.equal((await anonymous.call("note-delete", { id: kept })).status, 401);
  assert.equal((await other.call("note-delete", { id: kept, ownerId: owner.id, owner_user_id: owner.id })).status, 403);
  assert.equal((await owner.call("note-delete", { id: kept }, { "X-CSRF-Token": "forged" })).status, 403);
  assert.equal((await owner.call("note-delete", { id: kept }, { Origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await owner.call("note-delete", { id: kept }, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await owner.call("note-delete")).status, 405);
  for (const input of [{}, { id: "0" }, { id: 5 }]) {
    assert.equal((await owner.call("note-delete", input)).status, 422);
  }
  assert.equal(await status(kept), 200);
  assert.equal((await owner.call("note-delete", { id: kept })).status, 200);
  assert.equal(await status(kept), 404);
  console.log("PASS: card 116 HTTP owner delete, missing notes, signed-out/forged/non-owner rejection, CSRF/origin, validation");
} finally {
  for (const person of [owner, other]) {
    if (!person.registered) continue;
    try {
      assert.equal((await person.call("delete", { currentPassword: password })).status, 200);
    } catch {
      console.error("Test account cleanup failed; remove the notely-delete account created by this run on DEV/TEST.");
    }
  }
}
