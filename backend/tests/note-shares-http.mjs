// Card 156 HTTP contract for sharing one course's notes, read only, with chosen friends. Run only against
// DEV or TEST with migrations 012 and 013 applied. It creates and deletes its own accounts.
// Locally: NOTELY_TEST_ISOLATED=1 NOTELY_TEST_URL=http://127.0.0.1:8081/api/index.php node backend/tests/note-shares-http.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = new URL(process.env.NOTELY_TEST_URL || "http://127.0.0.1:8081/api/index.php");
assert(["localhost", "127.0.0.1", "aptitude.cse.buffalo.edu"].includes(endpoint.hostname), "Run share tests only on DEV or TEST.");
assert(endpoint.hostname === "aptitude.cse.buffalo.edu" || process.env.NOTELY_TEST_ISOLATED === "1",
  "Confirm the local API uses an isolated DEV database, then set NOTELY_TEST_ISOLATED=1. No requests sent.");
const origin = process.env.NOTELY_TEST_ORIGIN || endpoint.origin;
const password = `Share meadow ${randomUUID()}!`;

function client(name) {
  return {
    name, cookie: "", csrf: "", registered: false,
    email: `notely-shares-${randomUUID()}@example.edu`,
    async call(route, body, headers = {}) {
      const url = new URL(endpoint);
      url.search = `?route=${route}`;
      const response = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: { Cookie: this.cookie, Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error", signal: AbortSignal.timeout(15000),
      });
      for (const cookie of response.headers.getSetCookie()) this.cookie = cookie.split(";")[0];
      const data = await response.json();
      if (data.csrfToken) this.csrf = data.csrfToken;
      return { status: response.status, data };
    },
  };
}

const owner = client("Share Test Owner");
const friend = client("Share Test Friend");
const other = client("Share Test Other");
const anonymous = client("");
const EDIT = "You do not have permission to edit this note.";
const FRIENDS_ONLY = "You can share notes only with friends.";
function expectError(result, status, message) {
  assert.equal(result.status, status, JSON.stringify(result.data));
  assert.deepEqual(result.data, { error: message });
}
async function sharedTitles(person) {
  const result = await person.call("shared-notes");
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.notes.map((note) => note.title);
}
async function ownTitles(person) {
  return (await person.call("notes")).data.notes.map((note) => note.title);
}
const share = (friendIds, courseId = "cse442") => owner.call("course-notes-share", { courseId, courseCode: "CSE 442", friendIds });

try {
  for (const person of [owner, friend, other, anonymous]) {
    assert.equal((await person.call("session")).status, 200, "the API must be configured and reachable");
  }
  for (const person of [owner, friend, other]) {
    const result = await person.call("register", { name: person.name, email: person.email, password });
    person.registered = result.status === 201;
    assert.equal(result.status, 201, JSON.stringify(result.data));
  }
  // The owner asks both; only the friend accepts, so the other stays a pending request.
  assert.equal((await owner.call("friend-request", { email: friend.email })).status, 201);
  assert.equal((await owner.call("friend-request", { email: other.email })).status, 201);
  const incoming = (await friend.call("friends")).data.incoming[0];
  assert.equal((await friend.call("friend-respond", { id: incoming.id, accept: true })).status, 200);
  const lists = (await owner.call("friends")).data;
  const fr = lists.friends[0];
  const pending = lists.outgoing[0];
  const week9 = (await owner.call("note-create", { title: "Week 9 summary", body: "Sprint review notes", courseId: "cse442" })).data.note;
  const otherCourse = (await owner.call("note-create", { title: "Data structures", courseId: "cse250" })).data.note;

  // Task test 1: the chosen friend sees the course's notes, read only, with who shared them.
  const shared = await share([fr.userId]);
  assert.equal(shared.status, 200, JSON.stringify(shared.data));
  assert.deepEqual(shared.data, { shares: [{ userId: fr.userId, name: friend.name, email: friend.email }] });
  assert.deepEqual((await owner.call("course-notes-shares&courseId=cse442")).data, shared.data);
  const list = (await friend.call("shared-notes")).data.notes;
  assert.deepEqual(list.map((note) => note.title), ["Week 9 summary"]);
  assert.deepEqual(list[0].sharedBy, { id: week9.ownerId, name: owner.name, courseCode: "CSE 442" });
  assert.equal(list[0].permission, "view");
  const read = await friend.call(`note&id=${week9.id}`);
  assert.equal(read.status, 200);
  assert.equal(read.data.note.body, "Sprint review notes");
  assert.equal(read.data.note.sharedBy.name, owner.name);
  // Shared notes stay out of the friend's own list, and other courses aren't shared.
  assert.deepEqual(await ownTitles(friend), []);
  expectError(await friend.call(`note&id=${otherCourse.id}`), 404, "This note could not be found.");
  console.log("PASS 1: the chosen friend reads the course's notes, marked with who shared them");

  // Task test 2: a pending request, a stranger, or yourself can't be chosen; others see nothing.
  expectError(await share([pending.userId]), 422, FRIENDS_ONLY);
  expectError(await share([week9.ownerId]), 422, FRIENDS_ONLY);
  expectError(await share(["abc"]), 422, FRIENDS_ONLY);
  expectError(await share("everyone"), 422, FRIENDS_ONLY);
  expectError(await share([fr.userId], "bad course!"), 422, "Choose a valid course.");
  expectError(await owner.call("course-notes-share", { courseId: "cse442", friendIds: [fr.userId] }), 422, "Choose a valid course.");
  expectError(await owner.call("course-notes-shares&courseId="), 422, "Choose a valid course.");
  assert.deepEqual((await owner.call("course-notes-shares&courseId=cse442")).data.shares.map((s) => s.name), [friend.name],
    "a refused request leaves the list as it was");
  assert.deepEqual(await sharedTitles(other), []);
  expectError(await other.call(`note&id=${week9.id}`), 404, "This note could not be found.");
  console.log("PASS 2: only accepted friends can be chosen, and anyone else sees nothing");

  // Task test 3: every write, and the note's history, comments, and collaborators, are refused to the friend.
  expectError(await friend.call("note-title", { id: week9.id, title: "Mine" }), 403, EDIT);
  expectError(await friend.call("note-content", { id: week9.id, body: "Mine" }), 403, EDIT);
  expectError(await friend.call("note-save", { id: week9.id, title: "Mine", body: "Mine" }), 403, EDIT);
  expectError(await friend.call("note-pin", { id: week9.id, pinned: true }), 403, EDIT);
  assert.equal((await owner.call("note-save", { id: week9.id, visibility: "shared" })).status, 200);
  expectError(await friend.call("note-comment", { id: week9.id, body: "Mine" }), 403, EDIT);
  expectError(await friend.call("note-delete", { id: week9.id }), 403, "Only the note's owner can delete it.");
  expectError(await friend.call("note-invite", { id: week9.id, email: other.email }), 403, "Only the note's owner can invite collaborators.");
  for (const route of ["note-versions", "note-comments", "note-collaborators"]) {
    expectError(await friend.call(`${route}&id=${week9.id}`), 404, "This note could not be found.");
  }
  const unchanged = (await owner.call(`note&id=${week9.id}`)).data.note;
  assert.deepEqual([unchanged.title, unchanged.body, unchanged.pinned], ["Week 9 summary", "Sprint review notes", false]);
  console.log("PASS 3: the friend can't change, comment on, delete, or see the history of a shared note");

  // Task test 4: notes added later are shared too; unsharing or removing the friend ends access.
  assert.equal((await owner.call("note-create", { title: "Week 10 summary", courseId: "cse442" })).status, 201);
  assert.deepEqual((await sharedTitles(friend)).sort(), ["Week 10 summary", "Week 9 summary"]);
  assert.deepEqual((await share([])).data, { shares: [] });
  assert.deepEqual(await sharedTitles(friend), []);
  expectError(await friend.call(`note&id=${week9.id}`), 404, "This note could not be found.");
  assert.equal((await share([fr.userId])).status, 200);
  assert.equal((await sharedTitles(friend)).length, 2);
  assert.equal((await owner.call("friend-remove", { id: fr.id })).status, 200);
  assert.deepEqual(await sharedTitles(friend), []);
  assert.deepEqual((await owner.call("course-notes-shares&courseId=cse442")).data.shares, []);
  console.log("PASS 4: later notes are shared, and unsharing or removing the friend ends access");

  // Task test 5: signed-out and forged requests are refused.
  expectError(await anonymous.call("shared-notes"), 401, "Sign in to continue.");
  expectError(await anonymous.call("course-notes-shares&courseId=cse442"), 401, "Sign in to continue.");
  expectError(await anonymous.call("course-notes-share", { courseId: "cse442", courseCode: "CSE 442", friendIds: [] }), 401, "Sign in to continue.");
  expectError(await owner.call("course-notes-share", { courseId: "cse442", courseCode: "CSE 442", friendIds: [] }, { "X-CSRF-Token": "forged" }),
    403, "Your session changed. Reload the page and try again.");
  expectError(await owner.call("course-notes-share", { courseId: "cse442", courseCode: "CSE 442", friendIds: [] }, { Origin: "https://example.com" }),
    403, "This request did not come from your workspace.");
  console.log("PASS 5: signed-out, forged, and cross-site requests are refused");
  console.log("PASS: course notes are shared read-only with chosen friends only");
} finally {
  for (const person of [owner, friend, other]) {
    if (!person.registered) continue;
    try {
      assert.equal((await person.call("delete", { currentPassword: password })).status, 200);
    } catch {
      process.exitCode = 1;
      console.error(`Account cleanup failed: remove the temporary account ${person.email}.`);
    }
  }
}
