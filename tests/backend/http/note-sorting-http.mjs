// HTTP contract for card 60 (deterministic note sorting on the notes list).
// Run only against a DEV/TEST API with migrations 001 to 004 applied.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php";
const url = new URL(endpoint);
assert(["localhost", "127.0.0.1", "aptitude.cse.buffalo.edu"].includes(url.hostname), "Run note tests only on DEV or TEST.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = "Sample meadow password 42!";

const student = {
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
const titles = async (params) => {
  const response = await student.call(`notes${params}`);
  assert.equal(response.status, 200, `notes${params}`);
  return response.data.notes.map((note) => note.title);
};

let registered = false;
try {
  await student.call("session");
  const email = `notely-sort-${randomUUID()}@example.edu`;
  assert.equal((await student.call("register", { name: "Sort Student", email, password })).status, 201);
  registered = true;

  // Test 1 - the requested field decides the order (created quickly, so timestamps can tie).
  const ids = {};
  for (const title of ["banana", "Apple", "cherry"]) ids[title] = (await student.call("note-create", { title })).data.note.id;
  assert.deepEqual(await titles("&sort=title"), ["Apple", "banana", "cherry"], "title is A to Z ignoring capital letters");
  assert.deepEqual(await titles("&sort=created"), ["cherry", "Apple", "banana"], "created is newest first");
  assert.deepEqual(await titles("&sort=modified"), ["cherry", "Apple", "banana"], "modified is newest first");
  assert.deepEqual(await titles(""), ["cherry", "Apple", "banana"], "no sort means modified");
  assert.deepEqual(await titles("&sort="), ["cherry", "Apple", "banana"], "an empty sort means modified");

  // Editing a note moves it first by modified time, but not by created time.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.equal((await student.call("note-save", { id: ids.banana, title: "banana", body: "ripe" })).status, 200);
  assert.deepEqual(await titles("&sort=modified"), ["banana", "cherry", "Apple"], "the edited note is newest by modified time");
  assert.deepEqual(await titles("&sort=created"), ["cherry", "Apple", "banana"], "editing does not change created order");

  // Test 2 - unknown sorts are rejected and ties always come back in the same order.
  for (const bad of ["size", "Title", "TITLE", "title ", "updated_at", "title;DROP"]) {
    const response = await student.call(`notes&sort=${encodeURIComponent(bad)}`);
    assert.equal(response.status, 422, `${JSON.stringify(bad)} is rejected`);
    assert.equal(response.data.error, "Choose a valid sort.");
  }
  assert.equal((await student.call("notes&sort[]=title")).status, 422, "an array value is rejected");
  for (const title of ["Same title", "same title", "Same title"]) await student.call("note-create", { title });
  const first = await titles("&sort=title");
  for (let i = 0; i < 3; i += 1) assert.deepEqual(await titles("&sort=title"), first, "repeated requests return the same order");
  const sameIds = (await student.call("notes&sort=title")).data.notes.filter((n) => n.title.toLowerCase() === "same title").map((n) => Number(n.id));
  assert.deepEqual(sameIds, [...sameIds].sort((a, b) => a - b), "equal titles are ordered by note ID");

  console.log("PASS: card 60 notes list sorts by modified, created or title, breaks ties by ID, and rejects unknown sorts");
} finally {
  if (registered) await student.call("delete", { currentPassword: password });
}
