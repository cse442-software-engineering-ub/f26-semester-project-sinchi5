// Card 43: real HTTP tests for syllabus uploads. Requires PHP/PDO MySQL, a disposable local
// database with migrations 001-005, and backend/dev-router.php on port 8080.
// Only after confirming that the API uses an isolated DEV/TEST database:
// NOTELY_TEST_ISOLATED=1 node backend/tests/syllabus-upload-http.mjs
// Optional: NOTELY_TEST_URL and NOTELY_TEST_ORIGIN (the configured PHP origin).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = new URL(process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php");
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Use a local disposable DEV/TEST API only.");
assert.equal(process.env.NOTELY_TEST_ISOLATED, "1",
  "Confirm the local API uses an approved isolated DEV/TEST database, then set NOTELY_TEST_ISOLATED=1. No requests sent.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = `Upload meadow ${randomUUID()}!`;
const syllabus = "CSE 442 Software Engineering - Fall 2026 Syllabus\nHomework 1 due September 28, 2026\n"
  + "Midterm exam October 14, 2026 at 10:00 AM\nFinal project due December 4, 2026\n";
const base64 = (text) => Buffer.from(text).toString("base64");

function client() {
  return {
    cookie: "", csrf: "", registered: false,
    email: `notely-upload-${randomUUID()}@example.edu`,
    async call(route, body, options = {}) {
      const target = new URL(url);
      target.search = `?route=${route}`;
      const response = await fetch(target, {
        method: options.method || (body === undefined ? "GET" : "POST"),
        headers: {
          Cookie: this.cookie, Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }),
          ...options.headers,
        },
        ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
        redirect: "error", signal: AbortSignal.timeout(60000),
      });
      for (const cookie of response.headers.getSetCookie()) this.cookie = cookie.split(";")[0];
      const data = await response.json();
      if (data.csrfToken) this.csrf = data.csrfToken;
      return { status: response.status, data, headers: response.headers };
    },
  };
}
const owner = client();
const other = client();
const anonymous = client();
let passed = 0;
const pass = (number, description) => { passed++; console.log(`PASS ${number}: ${description}`); };
const expectError = (result, status, message) => assert.deepEqual([result.status, result.data], [status, { error: message }]);
const upload = (person, fileName, content, courseId = "cse442") =>
  person.call("syllabus-upload", { courseId, fileName, content });

try {
  for (const person of [owner, other, anonymous]) assert.equal((await person.call("session")).status, 200);
  for (const [person, name] of [[owner, "Upload Owner"], [other, "Upload Other"]]) {
    const result = await person.call("register", { name, email: person.email, password });
    person.registered = result.status === 201;
    assert.equal(result.status, 201);
  }

  const created = await upload(owner, "cse442-syllabus.txt", base64(syllabus));
  assert.equal(created.status, 201);
  const job = created.data.job;
  assert.match(job.id, /^[1-9][0-9]*$/);
  assert.deepEqual({ ...job, id: "", createdAt: "" }, { id: "", kind: "syllabus", courseId: "cse442",
    name: "cse442-syllabus.txt", type: "txt", size: Buffer.byteLength(syllabus), state: "queued", events: [], createdAt: "" });
  const read = await owner.call(`import-job&id=${job.id}`);
  assert.equal(read.status, 200);
  assert.deepEqual(read.data.job, job);
  // A file of exactly 20 MB must be stored too; this fails if the server's PHP memory or MySQL
  // max_allowed_packet is too small for the advertised limit.
  const full = await upload(owner, "full-size.txt", Buffer.alloc(20 * 1024 * 1024, 97).toString("base64"));
  assert.equal(full.status, 201, `a 20 MB upload failed: ${JSON.stringify(full.data)}`);
  assert.equal(full.data.job.size, 20 * 1024 * 1024);
  pass(1, "a valid syllabus, up to exactly 20 MB, creates a queued job that its owner can read");

  for (const [fileName, content, message] of [
    ["syllabus.exe", base64("x"), "Choose a PDF, DOCX, TXT, Markdown, or supported image file."],
    ["fake.pdf", base64("MZ program"), "Choose a PDF, DOCX, TXT, Markdown, or supported image file."],
    ["empty.txt", "", "This file is empty. Please choose another."],
    ["big.txt", Buffer.alloc(20 * 1024 * 1024 + 1, 97).toString("base64"), "Choose a file smaller than 20 MB."],
  ]) expectError(await upload(owner, fileName, content), 422, message);
  expectError(await upload(owner, "cse442-syllabus.txt", base64(syllabus), "../cse442"), 422, "Choose a course for this syllabus.");
  const tooLarge = JSON.stringify({ courseId: "cse442", fileName: "huge.txt", content: "A".repeat(28 * 1024 * 1024) });
  expectError(await owner.call("syllabus-upload", tooLarge), 413, "Choose a file smaller than 20 MB.");
  // No other writers use the isolated database, so a skipped ID would mean a rejected upload was stored.
  const next = await upload(owner, "week-1.md", base64("Quiz 1 on September 8\n"));
  assert.equal(next.status, 201);
  assert.equal(next.data.job.id, String(BigInt(full.data.job.id) + 1n));
  pass(2, "unsupported, mismatched, empty, oversized, and course-less uploads are rejected and not stored");

  expectError(await other.call(`import-job&id=${job.id}`), 404, "This upload could not be found.");
  expectError(await anonymous.call(`import-job&id=${job.id}`), 401, "Sign in to continue.");
  expectError(await anonymous.call("syllabus-upload", { courseId: "cse442", fileName: "a.txt", content: base64("a") }),
    401, "Sign in to continue.");
  expectError(await owner.call("import-job&id=0"), 422, "Choose a valid upload.");
  pass(3, "another student and a signed-out visitor can't read the job");

  for (const [options, status, message] of [
    [{ headers: { "X-CSRF-Token": "forged" } }, 403, "Your session changed. Reload the page and try again."],
    [{ headers: { Origin: "https://attacker.invalid" } }, 403, "This request did not come from your workspace."],
    [{ headers: { "Content-Type": "text/plain" } }, 415, "Send requests as JSON."],
  ]) expectError(await owner.call("syllabus-upload", { courseId: "cse442", fileName: "a.txt", content: base64("a") }, options),
    status, message);
  const wrongMethod = await owner.call("syllabus-upload");
  expectError(wrongMethod, 405, "This request method is not supported.");
  assert.equal(wrongMethod.headers.get("allow"), "POST");
  expectError(await owner.call(`import-job&id=${job.id}`, {}), 405, "This request method is not supported.");
  pass(4, "forged CSRF, foreign origins, non-JSON bodies, and wrong methods are rejected");
} catch (error) {
  console.error(`FAIL: ${passed}/4 task tests passed; remaining tests did not complete.`);
  throw error;
} finally {
  // Deleting each account also deletes its import jobs (ON DELETE CASCADE).
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
