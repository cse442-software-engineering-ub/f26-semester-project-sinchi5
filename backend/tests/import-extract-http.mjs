// Real HTTP tests for import-extract without spending API credits: the local API has no key, or
// blocks live calls because its origin is local. Requires PHP/PDO MySQL, a disposable local database
// with migrations 001-006, and backend/dev-router.php on port 8080.
// Only after confirming that the API uses an isolated DEV/TEST database:
// NOTELY_TEST_ISOLATED=1 node backend/tests/import-extract-http.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = new URL(process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php");
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Use a local disposable DEV/TEST API only.");
assert.equal(process.env.NOTELY_TEST_ISOLATED, "1",
  "Confirm the local API uses an approved isolated DEV/TEST database, then set NOTELY_TEST_ISOLATED=1. No requests sent.");
assert.notEqual(process.env.NOTELY_AI_LIVE, "1", "Unset NOTELY_AI_LIVE: these tests must never call the Claude API.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = `Extract meadow ${randomUUID()}!`;

function client() {
  return {
    cookie: "", csrf: "", registered: false,
    email: `notely-extract-${randomUUID()}@example.edu`,
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
const anonymous = client();
let passed = 0;
const pass = (number, description) => { passed++; console.log(`PASS ${number}: ${description}`); };
const expectError = (result, status, message) => assert.deepEqual([result.status, result.data], [status, { error: message }]);
async function upload(fileName, text) {
  const result = await owner.call("syllabus-upload", { courseId: "cse442", fileName, content: Buffer.from(text).toString("base64") });
  assert.equal(result.status, 201);
  return result.data.job;
}

try {
  for (const [person, name] of [[owner, "Extract Owner"], [other, "Extract Other"]]) {
    assert.equal((await person.call("session")).status, 200);
    const result = await person.call("register", { name, email: person.email, password });
    person.registered = result.status === 201;
    assert.equal(result.status, 201);
  }
  assert.equal((await anonymous.call("session")).status, 200);

  const text = await upload("cse442-syllabus.txt", "Homework 1 due September 28, 2026");
  expectError(await owner.call("import-extract", { id: text.id, year: 2026 }), 422, "TXT and Markdown syllabi are read in your browser.");
  assert.equal((await owner.call(`import-job&id=${text.id}`)).data.job.state, "queued");
  pass(1, "text syllabi are never sent for automatic reading");

  const pdf = await upload("syllabus.pdf", "%PDF-1.7\nHomework 1 due September 28, 2026");
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await owner.call("import-extract", { id: pdf.id, year: 2026 });
    assert.equal(result.status, 503);
    assert.match(result.data.error, /^Automatic reading (isn't set up yet|is off in local development)\./);
    const job = (await owner.call(`import-job&id=${pdf.id}`)).data.job;
    assert.deepEqual([job.state, job.events], ["failed", []]);
  }
  pass(2, "without a key, or from a local origin, the read is blocked, the job fails, and it can be retried");

  expectError(await other.call("import-extract", { id: pdf.id, year: 2026 }), 404, "This upload could not be found.");
  expectError(await anonymous.call("import-extract", { id: pdf.id, year: 2026 }), 401, "Sign in to continue.");
  for (const year of ["2026", 1999, 2101, 2026.5]) {
    expectError(await owner.call("import-extract", { id: pdf.id, year }), 422, "Choose a valid course year.");
  }
  expectError(await owner.call("import-extract", { id: "x", year: 2026 }), 422, "Choose a valid upload.");
  pass(3, "only the owner can ask for a read, with a valid job and course year");
} catch (error) {
  console.error(`FAIL: ${passed}/3 task tests passed; remaining tests did not complete.`);
  throw error;
} finally {
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
