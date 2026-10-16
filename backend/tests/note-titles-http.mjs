// HTTP contract for card 108. Run only against a DEV/TEST API with migration 002 applied.
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
try {
  await owner.call("session");
  await other.call("session");
  for (const [person, name] of [[owner, "Owner"], [other, "Other"]]) {
    const email = `notely-title-${randomUUID()}@example.edu`;
    assert.equal((await person.call("register", { name, email, password })).status, 201);
    person.registered = true;
  }

  // Test 1: the owner can rename an existing note and retrieve the saved title.
  const created = await owner.call("note-create", { title: "CSE 442 Notes" });
  assert.equal(created.status, 201);
  const id = created.data.note.id;
  assert.match(id, /^[1-9][0-9]*$/);
  assert.equal((await owner.call("note-title", { id, title: "CSE 442 Sprint Notes" })).status, 200);
  assert.equal((await owner.call(`note&id=${id}`)).data.note.title, "CSE 442 Sprint Notes");

  // Test 2: a different signed-in user cannot rename or read the owner's note.
  assert.equal((await other.call("note-title", { id, title: "Unauthorized title" })).status, 403);
  assert.equal((await other.call(`note&id=${id}`)).status, 404);
  assert.equal((await owner.call(`note&id=${id}`)).data.note.title, "CSE 442 Sprint Notes");

  // Test 3: a missing note cannot be renamed or created by an update request.
  const missing = "9999999999999999999";
  assert.equal((await owner.call("note-title", { id: missing, title: "Ghost note" })).status, 404);
  assert.equal((await owner.call(`note&id=${missing}`)).status, 404);
  assert.equal((await owner.call(`note&id=${id}`)).data.note.title, "CSE 442 Sprint Notes");

  assert.equal((await owner.call("note-title", { id, title: "Bad CSRF" }, { "X-CSRF-Token": "forged" })).status, 403);
  assert.equal((await owner.call(`note&id=${id}`)).data.note.title, "CSE 442 Sprint Notes");
  console.log("PASS: card 108 HTTP title update, ownership, missing note, and CSRF checks");
} finally {
  for (const person of [owner, other]) {
    if (!person.registered) continue;
    try { await person.call("delete", { currentPassword: password }); }
    catch { console.error("Test account cleanup failed; remove the notely-title account created by this run on DEV/TEST."); }
  }
}
