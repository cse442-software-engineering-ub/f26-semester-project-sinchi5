import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint =
  process.env.NOTELY_TEST_URL ||
  "http://127.0.0.1:8080/api/index.php";

const url = new URL(endpoint);

assert(
  ["localhost", "127.0.0.1", "aptitude.cse.buffalo.edu"].includes(url.hostname),
  "Run task tests only on DEV or aptitude.",
);

const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = "Sample meadow password 42!";

function client() {
  return {
    cookie: "",
    csrf: "",

    async call(route, body) {
      const response = await fetch(`${endpoint}?route=${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: this.cookie,
          Origin: origin,
          ...(body === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "X-CSRF-Token": this.csrf,
              }),
        },
        ...(body === undefined
          ? {}
          : {
              body: JSON.stringify(body),
            }),
        redirect: "error",
      });

      for (const cookie of response.headers.getSetCookie()) {
        this.cookie = cookie.split(";")[0];
      }

      const data = await response.json();

      if (data.csrfToken) {
        this.csrf = data.csrfToken;
      }

      assert.equal(response.headers.get("cache-control"), "no-store");

      return {
        status: response.status,
        data,
      };
    },
  };
}

const userA = client();
const userB = client();
const anonymous = client();

const userAEmail = `student-${randomUUID()}@example.com`;
const userBEmail = `student-b-${randomUUID()}@example.com`;

//
// Test 1 - Create a note
//

await userA.call("session");

const accountA = await userA.call("register", {
  name: "Student A",
  email: userAEmail,
  password,
});

assert.equal(accountA.status, 201);

const created = await userA.call("create-note", {
  title: "CSE 442 Notes",
  body: "User stories and acceptance tests.",
});

assert.equal(created.status, 201);
assert.equal(created.data.note.title, "CSE 442 Notes");
assert.equal(
  created.data.note.body,
  "User stories and acceptance tests.",
);
assert.equal(
  created.data.note.ownerId,
  accountA.data.user.id,
);
assert.ok(created.data.note.createdAt);
assert.ok(created.data.note.updatedAt);

const userANotes = await userA.call("notes");

assert.equal(userANotes.status, 200);

const savedNote = userANotes.data.notes.find(
  (note) => note.id === created.data.note.id,
);

assert.ok(savedNote);
assert.equal(savedNote.title, "CSE 442 Notes");
assert.equal(
  savedNote.body,
  "User stories and acceptance tests.",
);

console.log("PASS: create note");

//
// Test 2 - Associate note with correct user
//

const privateNote = await userA.call("create-note", {
  title: "Private Notes",
  body: "Only User A should see this note.",
});

assert.equal(privateNote.status, 201);

await userB.call("session");

const accountB = await userB.call("register", {
  name: "Student B",
  email: userBEmail,
  password,
});

assert.equal(accountB.status, 201);

const userBNotes = await userB.call("notes");

assert.equal(userBNotes.status, 200);

assert.equal(
  userBNotes.data.notes.some(
    (note) => note.title === "Private Notes",
  ),
  false,
);

assert.equal(
  userBNotes.data.notes.some(
    (note) => note.id === privateNote.data.note.id,
  ),
  false,
);

console.log("PASS: note belongs only to correct user");

//
// Test 3 - Reject unauthenticated note creation
//

const unauthenticated = await anonymous.call(
  "create-note",
  {
    title: "Unauthorized Note",
    body: "This should not be saved.",
  },
);

assert.equal(unauthenticated.status, 401);

console.log("PASS: unauthenticated note creation rejected");

console.log("PASS: Task #106 note creation tests");