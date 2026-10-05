// HTTP contract for card 120. Run only against a DEV/TEST API with migrations 002, 003, and 004 applied.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php";
const url = new URL(endpoint);
assert(["localhost", "127.0.0.1", "aptitude.cse.buffalo.edu"].includes(url.hostname), "Run note tests only on DEV or TEST.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = "Sample meadow password 42!";

function client() {
  return {
    cookie: "", csrf: "", registered: false, email: "",
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

const studentA = client();
const studentB = client();
const anonymous = client();
try {
  for (const person of [studentA, studentB, anonymous]) await person.call("session");
  for (const [person, name] of [[studentA, "Student A"], [studentB, "Student B"]]) {
    person.email = `notely-server-${randomUUID()}@example.edu`;
    assert.equal((await person.call("register", { name, email: person.email, password })).status, 201);
    person.registered = true;
  }
  const titles = async (person) => (await person.call("notes")).data.notes.map((note) => note.title);

  // Student A creates and shares a note with Student B.
  const created = await studentA.call("note-create", {
    title: "Shared study guide", body: "Chapter 1", courseId: "cse442", lectureDate: "2026-10-05", tags: ["exam"],
  });
  assert.equal(created.status, 201);
  const id = created.data.note.id;
  assert.deepEqual(created.data.note.tags, ["exam"]);
  assert.equal((await studentA.call("note-save", { id, title: "Shared study guide", body: "Chapter 2", visibility: "shared" })).status, 200);
  assert.equal((await studentA.call("note-invite", { id, email: `missing-${randomUUID()}@example.edu` })).status, 404);
  const invited = await studentA.call("note-invite", { id, email: studentB.email });
  assert.equal(invited.status, 200);
  assert.equal(invited.data.collaborator.permission, "view");
  assert.equal((await studentA.call("note-comment", { id, body: "Read chapter 2 first." })).status, 200);

  // Student B can open it but cannot delete or reshare it.
  assert.deepEqual(await titles(studentB), ["Shared study guide"]);
  const opened = await studentB.call(`note&id=${id}`);
  assert.equal(opened.status, 200);
  assert.equal(opened.data.note.body, "Chapter 2");
  assert.equal((await studentB.call(`note-comments&id=${id}`)).data.comments.length, 1);
  assert.equal((await studentB.call("note-delete", { id })).status, 403);
  assert.equal((await studentB.call("note-invite", { id, email: studentA.email })).status, 403);

  // Request checks on the new routes.
  assert.equal((await anonymous.call("notes")).status, 401);
  assert.equal((await studentA.call("note-save", { id, title: "Forged", body: "" }, { "X-CSRF-Token": "forged" })).status, 403);
  assert.equal((await studentA.call("note-pin", { id, pinned: "yes" })).status, 422);
  assert.equal((await studentA.call("notes", {})).status, 405);

  // Student A deletes it; Student B loses the note and its comments.
  assert.equal((await studentA.call("note-delete", { id })).status, 200);
  assert.deepEqual(await titles(studentA), []);
  assert.deepEqual(await titles(studentB), []);
  const gone = await studentB.call(`note&id=${id}`);
  assert.equal(gone.status, 404);
  assert.equal(gone.data.error, "This note could not be found.");
  assert.equal((await studentB.call(`note-comments&id=${id}`)).status, 404);
  console.log("PASS: card 120 HTTP sharing, collaborator access, owner-only delete, lost access after delete, request checks");
} finally {
  for (const person of [studentA, studentB]) {
    if (!person.registered) continue;
    try {
      assert.equal((await person.call("delete", { currentPassword: password })).status, 200);
    } catch {
      console.error("Test account cleanup failed; remove the notely-server account created by this run on DEV/TEST.");
    }
  }
}
