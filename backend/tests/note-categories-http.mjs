// HTTP contract for card 39 (persist and validate a note category).
// Run only against a DEV/TEST API with migrations 001 to 004 applied.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php";
const url = new URL(endpoint);
assert(["localhost", "127.0.0.1", "aptitude.cse.buffalo.edu"].includes(url.hostname), "Run note tests only on DEV or TEST.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = "Sample meadow password 42!";

function client() {
  return {
    cookie: "", csrf: "",
    async call(route, body) {
      const response = await fetch(`${endpoint}?route=${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: this.cookie,
          Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
      });
      for (const cookie of response.headers.getSetCookie()) this.cookie = cookie.split(";")[0];
      const data = await response.json();
      if (data.csrfToken) this.csrf = data.csrfToken;
      return { status: response.status, data };
    },
  };
}

const student = client();
let registered = false;
try {
  await student.call("session");
  const email = `notely-category-${randomUUID()}@example.edu`;
  assert.equal((await student.call("register", { name: "Category Student", email, password })).status, 201);
  registered = true;

  // Test 1 - save and retrieve a valid category.
  const created = await student.call("note-create", { title: "Team agenda", body: "Weekly sync", category: "Meetings" });
  assert.equal(created.status, 201, "a note with a valid category is created");
  assert.equal(created.data.note.category, "Meetings", "the create response contains the category");
  const id = created.data.note.id;
  const read = await student.call(`note&id=${id}`);
  assert.equal(read.status, 200);
  assert.equal(read.data.note.title, "Team agenda");
  assert.equal(read.data.note.category, "Meetings", "the retrieved note keeps the category");
  const moved = await student.call("note-save", { id, title: "Team agenda", body: "Weekly sync", category: "Work" });
  assert.equal(moved.status, 200, "the category can be updated");
  assert.equal((await student.call(`note&id=${id}`)).data.note.category, "Work", "the update was saved");
  for (const category of ["School", "Work", "Meetings", "Personal"]) {
    const each = await student.call("note-create", { title: `A ${category} note`, category });
    assert.equal(each.status, 201);
    assert.equal(each.data.note.category, category, `${category} is accepted`);
  }

  // Test 2 - missing and unsupported categories.
  const plain = await student.call("note-create", { title: "No category chosen" });
  assert.equal(plain.status, 201);
  assert.equal(plain.data.note.category, "School", "a note with no category defaults to School");
  const plainId = plain.data.note.id;
  const rejected = await student.call("note-save", { id: plainId, title: "No category chosen", body: "", category: "Vacation" });
  assert.equal(rejected.status, 422, "an unsupported category is rejected");
  assert.equal(rejected.data.error, "Choose a valid category.");
  assert.equal((await student.call(`note&id=${plainId}`)).data.note.category, "School", "the saved note is unchanged");

  // Extra - the check is exact, so look-alike values are rejected on create and update.
  // A null category means "no selection", so it takes the School default (checked first).
  const nullCategory = await student.call("note-create", { title: "Null category", category: null });
  assert.equal(nullCategory.status, 201);
  assert.equal(nullCategory.data.note.category, "School", "a null category counts as no selection");
  for (const bad of ["work", "WORK", "", "Vacation", "School ", 5, ["Work"]]) {
    const attempt = await student.call("note-create", { title: "Should not exist", category: bad });
    assert.equal(attempt.status, 422, `create rejects ${JSON.stringify(bad)}`);
    const update = await student.call("note-save", { id: plainId, title: "No category chosen", body: "", category: bad });
    assert.equal(update.status, 422, `update rejects ${JSON.stringify(bad)}`);
  }
  const titles = (await student.call("notes")).data.notes.map((note) => note.title);
  assert(!titles.includes("Should not exist"), "a rejected create stores nothing");
  assert.equal((await student.call(`note&id=${plainId}`)).data.note.category, "School", "rejected updates changed nothing");

  console.log("PASS: card 39 category stored, defaulted to School, validated exactly, and unchanged by rejected updates");
} finally {
  // Remove the test account so repeated runs leave nothing behind.
  if (registered) await student.call("delete", { currentPassword: password });
}
