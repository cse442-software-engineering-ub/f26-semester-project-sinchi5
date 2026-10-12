// HTTP contract for card 61 (sorting combined with the notes list filters and search).
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

const owner = client();
const friend = client();
const people = [owner, friend];
try {
  for (const person of people) await person.call("session");
  for (const [person, name] of [[owner, "Sort Owner"], [friend, "Sort Friend"]]) {
    person.email = `notely-sort-filter-${randomUUID()}@example.edu`;
    assert.equal((await person.call("register", { name, email: person.email, password })).status, 201);
    person.registered = true;
  }
  // Keeps the server's order (no client-side sorting), so the assertions check the API's sort.
  const titles = async (person, params) => {
    const response = await person.call(`notes${params}`);
    assert.equal(response.status, 200, `notes${params}`);
    return response.data.notes.map((note) => note.title);
  };
  const seed = async (title, category, extra = {}) => {
    const response = await owner.call("note-create", { title, body: `${title} body`, category, ...extra });
    assert.equal(response.status, 201, `seed ${title}`);
    return response.data.note.id;
  };

  // Test 1 - sorting applies after the category filter and the keyword search.
  await seed("Zebra lab", "School");
  await seed("Alpha lab", "School");
  await seed("Diary", "Personal");
  assert.deepEqual(await titles(owner, "&category=School&sort=title"), ["Alpha lab", "Zebra lab"], "category then A to Z");
  assert.deepEqual(await titles(owner, "&q=lab&sort=title"), ["Alpha lab", "Zebra lab"], "keyword then A to Z");
  assert.deepEqual(await titles(owner, "&category=School&sort=created"), ["Alpha lab", "Zebra lab"], "category then newest first");
  assert.deepEqual(await titles(owner, "&category=Personal&q=lab&sort=title"), [], "no match stays empty when sorted");

  // Sorting keeps working with the other existing filters.
  await seed("Beta exam", "School", { visibility: "shared", courseId: "cse442", lectureDate: "2026-10-01" });
  await seed("Alpha exam", "School", { visibility: "private", courseId: "cse331", lectureDate: "2026-09-01" });
  assert.deepEqual(await titles(owner, "&visibility=shared&sort=title"), ["Beta exam"], "visibility then sort");
  assert.deepEqual(await titles(owner, "&course=cse331&sort=title"), ["Alpha exam"], "course then sort");
  assert.deepEqual(await titles(owner, "&from=2026-08-01&sort=title"), ["Alpha exam", "Beta exam"], "date range then sort");
  assert.deepEqual(await titles(owner, "&category=School&q=exam&to=2026-09-30&sort=title"), ["Alpha exam"], "all together");
  assert.equal((await owner.call("notes&category=School&sort=size")).status, 422, "an unknown sort is still rejected with filters");

  // Test 2 - sorting never brings back notes the caller cannot see.
  const shared = await seed("Shared lab notes", "Meetings", { visibility: "shared" });
  await seed("A private lab", "Meetings", { visibility: "private" });
  assert.deepEqual(await titles(friend, "&q=lab&sort=title"), [], "someone with no access sees nothing");
  assert.equal((await owner.call("note-invite", { id: shared, email: friend.email })).status, 200);
  assert.deepEqual(await titles(friend, "&q=lab&sort=title"), ["Shared lab notes"], "a collaborator sees only the shared note");
  assert.deepEqual(await titles(friend, "&category=Meetings&sort=created"), ["Shared lab notes"], "category and sort for a collaborator");
  const signedOut = client();
  await signedOut.call("session");
  assert.equal((await signedOut.call("notes&q=lab&sort=title")).status, 401, "signing in is still required");

  console.log("PASS: card 61 notes list sorts after the filters and search and never adds hidden notes");
} finally {
  // Remove the test accounts so repeated runs leave nothing behind.
  for (const person of people) if (person.registered) await person.call("delete", { currentPassword: password });
}
