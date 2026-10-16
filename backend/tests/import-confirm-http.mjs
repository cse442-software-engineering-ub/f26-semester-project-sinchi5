// Card 47: real HTTP tests for saving reviewed syllabus events. Requires PHP/PDO MySQL, a disposable
// local database with migrations 001-006, and backend/dev-router.php on port 8080.
// Only after confirming that the API uses an isolated DEV/TEST database:
// NOTELY_TEST_ISOLATED=1 node backend/tests/import-confirm-http.mjs
// Optional: NOTELY_TEST_URL and NOTELY_TEST_ORIGIN (the configured PHP origin).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = new URL(process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php");
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Use a local disposable DEV/TEST API only.");
assert.equal(process.env.NOTELY_TEST_ISOLATED, "1",
  "Confirm the local API uses an approved isolated DEV/TEST database, then set NOTELY_TEST_ISOLATED=1. No requests sent.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = `Confirm meadow ${randomUUID()}!`;

function client() {
  return {
    cookie: "", csrf: "", registered: false,
    email: `notely-confirm-${randomUUID()}@example.edu`,
    async call(route, body) {
      const target = new URL(url);
      target.search = `?route=${route}`;
      const response = await fetch(target, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: this.cookie, Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }),
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
const owner = client();
const other = client();
let passed = 0;
const pass = (number, description) => { passed++; console.log(`PASS ${number}: ${description}`); };
const expectError = (result, status, message) => assert.deepEqual([result.status, result.data], [status, { error: message }]);
const reviewed = [
  { title: "Homework 1", kind: "assignment", date: "2026-09-28" },
  { title: "Midterm exam", kind: "exam", date: "2026-10-14", time: "10:00" },
];
async function newJob(person) {
  const result = await person.call("syllabus-upload", {
    courseId: "cse442", fileName: "cse442-syllabus.txt", content: Buffer.from("CSE 442 syllabus").toString("base64"),
  });
  assert.equal(result.status, 201);
  return result.data.job;
}
async function events(person, query = "&courseId=cse442") {
  const result = await person.call(`events${query}`);
  assert.equal(result.status, 200);
  return result.data.events;
}

try {
  for (const [person, name] of [[owner, "Confirm Owner"], [other, "Confirm Other"]]) {
    assert.equal((await person.call("session")).status, 200);
    const result = await person.call("register", { name, email: person.email, password });
    person.registered = result.status === 201;
    assert.equal(result.status, 201);
  }

  const job = await newJob(owner);
  const confirmed = await owner.call("import-confirm", { id: job.id, events: reviewed });
  assert.deepEqual([confirmed.status, confirmed.data], [200, { created: 2 }]);
  const saved = await events(owner);
  assert.deepEqual(saved.map((e) => [e.title, e.date, e.source]),
    [["Homework 1", "2026-09-28", "imported"], ["Midterm exam", "2026-10-14", "imported"]]);
  assert.deepEqual(saved.map((e) => [e.courseId, e.kind, e.time, e.importJobId]),
    [["cse442", "assignment", "", job.id], ["cse442", "exam", "10:00", job.id]]);
  assert.equal((await owner.call(`import-job&id=${job.id}`)).data.job.state, "completed");
  pass(1, "reviewed events are saved to the job's course as imported events");

  const again = await owner.call("import-confirm", { id: job.id, events: reviewed });
  assert.deepEqual([again.status, again.data], [200, { created: 0 }]);
  assert.equal((await events(owner)).length, 2);
  pass(2, "repeating the same confirm creates no duplicates");

  const second = await newJob(owner);
  expectError(await owner.call("import-confirm", { id: second.id, events: [{ title: "", kind: "exam", date: "2026-10-14" }] }),
    422, "Give every event a title and a date.");
  expectError(await owner.call("import-confirm", { id: second.id, events: [{ title: "Quiz", date: "" }] }),
    422, "Give every event a title and a date.");
  assert.equal((await events(owner)).length, 2);
  assert.equal((await owner.call(`import-job&id=${second.id}`)).data.job.state, "queued");
  pass(3, "events without a title or date are rejected and nothing is saved");

  // A student can only add events from their own uploads, and only sees their own events.
  expectError(await other.call("import-confirm", { id: second.id, events: reviewed }), 404, "This upload could not be found.");
  assert.deepEqual(await events(other), []);
  assert.deepEqual(await events(other, ""), []);
  const moved = await owner.call("import-confirm", { id: second.id, courseId: "cse443", events: [reviewed[0]] });
  assert.deepEqual([moved.status, moved.data], [200, { created: 1 }]);
  assert.deepEqual((await events(owner, "&courseId=cse443")).map((e) => e.title), ["Homework 1"]);
  assert.equal((await events(owner, "")).length, 3);
  expectError(await owner.call("events&courseId=../x"), 422, "Choose a valid course.");
  pass(4, "jobs and events stay private, and the reviewed course is used");

  // Text from a syllabus is only ever data: SQL in a file name or an event title is stored as typed.
  const sneaky = await owner.call("syllabus-upload", { courseId: "cse442", fileName: "x'); DROP TABLE notely_events; --.txt",
    content: Buffer.from("Quiz 1 on September 8").toString("base64") });
  assert.equal(sneaky.status, 201);
  assert.equal(sneaky.data.job.name, "x'); DROP TABLE notely_events; --.txt");
  const titles = ["Robert'); DROP TABLE notely_events; --", "Quiz\" OR 1=1 --", "<img src=x onerror=alert(1)>"];
  const added = await owner.call("import-confirm", { id: sneaky.data.job.id, events: titles.map((title) => ({ title, date: "2026-11-02" })) });
  assert.deepEqual([added.status, added.data], [200, { created: 3 }]);
  assert.deepEqual((await events(owner)).filter((e) => e.date === "2026-11-02").map((e) => e.title).sort(), [...titles].sort());
  assert.equal((await events(owner, "")).length, 6);
  pass(5, "SQL and HTML in file names and titles are saved as plain text");
} catch (error) {
  console.error(`FAIL: ${passed}/5 task tests passed; remaining tests did not complete.`);
  throw error;
} finally {
  // Deleting each account also deletes its import jobs and events (ON DELETE CASCADE).
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
