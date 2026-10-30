// Card 172: real HTTP tests for deleting a saved syllabus event. Requires PHP/PDO MySQL, a disposable
// local database with migrations 001-008, and backend/dev-router.php on port 8080.
// Only after confirming that the API uses an isolated DEV/TEST database:
// NOTELY_TEST_ISOLATED=1 npm run test:event-delete
// Optional: NOTELY_TEST_URL and NOTELY_TEST_ORIGIN (the configured PHP origin).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = new URL(process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php");
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Use a local disposable DEV/TEST API only.");
assert.equal(process.env.NOTELY_TEST_ISOLATED, "1",
  "Confirm the local API uses an approved isolated DEV/TEST database, then set NOTELY_TEST_ISOLATED=1. No requests sent.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = `Delete meadow ${randomUUID()}!`;

function client() {
  return {
    cookie: "", csrf: "", registered: false,
    email: `notely-event-delete-${randomUUID()}@example.edu`,
    async call(route, body, headers = {}) {
      const target = new URL(url);
      target.search = `?route=${route}`;
      const response = await fetch(target, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: this.cookie, Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error", signal: AbortSignal.timeout(10000),
      });
      for (const cookie of response.headers.getSetCookie()) this.cookie = cookie.split(";")[0];
      const data = await response.json();
      if (data.csrfToken) this.csrf = data.csrfToken;
      return { status: response.status, data };
    },
  };
}
const a = client();
const b = client();
let passed = 0;
const pass = (number, description) => { passed++; console.log(`PASS ${number}: ${description}`); };
const expectError = (result, status, message) => assert.deepEqual([result.status, result.data], [status, { error: message }]);
const notFound = "This event could not be found.";
const invalid = "Choose a valid event.";

// Saves reviewed syllabus events the same way the upload window does (cards 43 and 47).
async function seed(person, events) {
  const upload = await person.call("syllabus-upload", {
    courseId: "cse442", fileName: "cse442-syllabus.txt", content: Buffer.from("CSE 442 syllabus").toString("base64"),
  });
  assert.equal(upload.status, 201);
  const confirmed = await person.call("import-confirm", { id: upload.data.job.id, events });
  assert.deepEqual([confirmed.status, confirmed.data], [200, { created: events.length }]);
}
async function titles(person) {
  const result = await person.call("events");
  assert.equal(result.status, 200);
  return result.data.events.map((e) => e.title);
}
async function idOf(person, title) {
  const event = (await person.call("events")).data.events.find((e) => e.title === title);
  assert(event, `${title} is saved`);
  return event.id;
}

try {
  for (const [person, name] of [[a, "Delete Owner"], [b, "Delete Other"]]) {
    assert.equal((await person.call("session")).status, 200);
    const result = await person.call("register", { name, email: person.email, password });
    person.registered = result.status === 201;
    assert.equal(result.status, 201);
  }
  await seed(a, [
    { title: "Quiz 1", kind: "quiz", date: "2026-11-12" },
    { title: "Project draft", kind: "deadline", date: "2026-11-19" },
    { title: "Final exam", kind: "exam", date: "2026-12-10", time: "08:00" },
  ]);
  await seed(b, [{ title: "Other quiz", kind: "quiz", date: "2026-11-12" }]);

  // Task test 1 - The owner cannot delete their own event
  const quiz = await idOf(a, "Quiz 1");
  const deleted = await a.call("event-delete", { id: quiz });
  assert.deepEqual([deleted.status, deleted.data], [200, { event: { id: quiz } }]);
  assert.deepEqual(await titles(a), ["Project draft", "Final exam"]);
  pass(1, "the owner deletes their own event and only that event is gone");

  // Task test 2 - Another student can delete someone else's event
  const draft = await idOf(a, "Project draft");
  expectError(await b.call("event-delete", { id: draft }), 404, notFound);
  assert.deepEqual(await titles(a), ["Project draft", "Final exam"]);
  assert.deepEqual(await titles(b), ["Other quiz"]);
  pass(2, "another student's event looks missing and is not deleted");

  // Task test 3 - A missing or invalid ID is not handled
  expectError(await a.call("event-delete", { id: "999999999" }), 404, notFound);
  for (const body of [{ id: "abc" }, {}, { id: 5 }, { id: "0" }, { id: [draft] }]) {
    expectError(await a.call("event-delete", body), 422, invalid);
  }
  assert.deepEqual(await titles(a), ["Project draft", "Final exam"]);
  pass(3, "an unknown ID is 404 and an invalid ID is 422, with nothing removed");

  // Task test 4 - A signed-out or forged request can delete an event
  const signedOut = client();
  assert.equal((await signedOut.call("session")).status, 200);
  expectError(await signedOut.call("event-delete", { id: draft }), 401, "Sign in to continue.");
  expectError(await a.call("event-delete", { id: draft }, { "X-CSRF-Token": "" }), 403,
    "Your session changed. Reload the page and try again.");
  expectError(await a.call("event-delete", { id: draft }, { Origin: "https://evil.example" }), 403,
    "This request did not come from your workspace.");
  assert.deepEqual(await titles(a), ["Project draft", "Final exam"]);
  pass(4, "signed-out, missing-CSRF, and wrong-origin requests are rejected with nothing removed");

  // Task test 5 - Deleting the same event twice changes something
  assert.equal((await a.call("event-delete", { id: draft })).status, 200);
  expectError(await a.call("event-delete", { id: draft }), 404, notFound);
  assert.deepEqual(await titles(a), ["Final exam"]);
  assert.deepEqual(await titles(b), ["Other quiz"]);
  pass(5, "a repeated delete is 404 and removes nothing more");

  console.log(`PASS: card 172 event-delete, ${passed} checks`);
} finally {
  // Deleting each account also deletes its import jobs and events (ON DELETE CASCADE).
  for (const person of [a, b]) {
    if (!person.registered) continue;
    try {
      assert.equal((await person.call("delete", { currentPassword: password })).status, 200);
    } catch {
      console.error(`Could not remove the test account ${person.email}.`);
    }
  }
}
