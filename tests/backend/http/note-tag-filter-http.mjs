// Card 175: exact tag filtering through the signed-in notes API.
// Use an isolated local DEV database, or aptitude TEST after deployment.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php";
const url = new URL(endpoint);
assert(["localhost", "127.0.0.1", "aptitude.cse.buffalo.edu"].includes(url.hostname), "Run note tests only on DEV or TEST.");
if (url.hostname !== "aptitude.cse.buffalo.edu") {
  assert.equal(process.env.NOTELY_TEST_ISOLATED, "1", "Confirm an isolated local DEV database with NOTELY_TEST_ISOLATED=1.");
}
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = "Sample meadow password 42!";

function client() {
  return {
    cookie: "", csrf: "", registered: false, email: "",
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
const reader = client();
const people = [owner, reader];
try {
  for (const person of people) await person.call("session");
  for (const [person, name] of [[owner, "Tag Owner"], [reader, "Tag Reader"]]) {
    person.email = `notely-tag-${randomUUID()}@example.edu`;
    assert.equal((await person.call("register", { name, email: person.email, password })).status, 201);
    person.registered = true;
  }
  const titles = async (person, params) => {
    const response = await person.call(`notes${params}`);
    assert.equal(response.status, 200, `notes${params}`);
    return response.data.notes.map((note) => note.title);
  };
  const seed = async (title, tags, courseId = "") => {
    const response = await owner.call("note-create", { title, tags, courseId });
    assert.equal(response.status, 201, `seed ${title}`);
    return response.data.note.id;
  };

  await seed("Exam outline", ["exam"], "cse442");
  await seed("Final exam guide", ["final exam"], "cse442");
  await seed("Project plan", ["project"], "cse442");
  const shared = await seed("Exam 331 review", ["exam"], "cse331");
  await seed("Half done", ["50%_done"]);
  await seed("Fifty X", ["50Xdone"]);

  assert.deepEqual((await titles(owner, "&tag=exam")).sort(), ["Exam 331 review", "Exam outline"]);
  assert.deepEqual(await titles(owner, "&tag=final%20exam"), ["Final exam guide"]);
  assert.deepEqual(await titles(owner, "&tag=exam&course=cse442"), ["Exam outline"]);
  assert.deepEqual(await titles(owner, "&tag=exam&course=cse442&q=plan"), []);
  assert.deepEqual(await titles(owner, "&tag=exam&sort=title"), ["Exam 331 review", "Exam outline"]);
  assert.deepEqual(await titles(owner, "&tag=50%25_done"), ["Half done"]);
  assert.deepEqual(await titles(owner, "&tag="), await titles(owner, ""), "an empty tag means no tag filter");

  assert.deepEqual(await titles(reader, "&tag=exam"), [], "another account cannot see private notes");
  assert.equal((await owner.call("note-invite", { id: shared, email: reader.email })).status, 200);
  assert.deepEqual(await titles(reader, "&tag=exam"), ["Exam 331 review"], "only the shared note is visible");
  const signedOut = client();
  await signedOut.call("session");
  assert.equal((await signedOut.call("notes&tag=exam")).status, 401);

  for (const bad of ["&tag[]=exam&tag[]=project", `&tag=${"x".repeat(101)}`]) {
    const response = await owner.call(`notes${bad}`);
    assert.equal(response.status, 422, `${bad} is invalid`);
    assert.equal(response.data.notes, undefined, "an invalid filter returns no notes");
  }

  console.log("PASS: card 175 filters by one exact tag, combines filters, and respects access");
} finally {
  for (const person of people) if (person.registered) await person.call("delete", { currentPassword: password });
}
