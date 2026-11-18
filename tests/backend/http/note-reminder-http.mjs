// Card 77: real HTTP persistence, validation, and permissions for note reminders.
// Use an isolated local DEV database with migrations through 010, or aptitude TEST after deployment.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php";
const url = new URL(endpoint);
assert(["localhost", "127.0.0.1", "aptitude.cse.buffalo.edu"].includes(url.hostname), "Run reminder tests only on DEV or TEST.");
if (url.hostname !== "aptitude.cse.buffalo.edu") {
  assert.equal(process.env.NOTELY_TEST_ISOLATED, "1", "Confirm an isolated local DEV database with NOTELY_TEST_ISOLATED=1.");
}
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = `Reminder meadow ${randomUUID()}!`;

function client() {
  return {
    cookie: "", csrf: "", registered: false, email: `notely-reminder-${randomUUID()}@example.edu`,
    async call(route, body) {
      const response = await fetch(`${endpoint}?route=${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: this.cookie, Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
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
try {
  for (const person of [owner, reader]) {
    assert.equal((await person.call("session")).status, 200);
    const name = person === owner ? "Reminder Owner" : "Reminder Reader";
    const result = await person.call("register", { name, email: person.email, password });
    person.registered = result.status === 201;
    assert.equal(result.status, 201);
  }
  const created = await owner.call("note-create", { title: "Project Deadline", visibility: "shared" });
  assert.equal(created.status, 201);
  const id = created.data.note.id;
  assert.equal(created.data.note.remindAt, null);
  const read = async () => {
    const result = await owner.call(`note&id=${id}`);
    assert.equal(result.status, 200);
    return result.data.note;
  };

  const first = new Date(Date.now() + 120000).toISOString();
  let result = await owner.call("note-reminder", { id, remindAt: first });
  assert.equal(result.status, 200);
  assert.equal(result.data.note.remindAt, first);
  assert.equal((await read()).remindAt, first, "GET keeps the reminder after a new request");
  assert.equal((await owner.call("notes")).data.notes.find((note) => note.id === id).remindAt, first);

  const second = new Date(Date.now() + 300000).toISOString();
  result = await owner.call("note-reminder", { id, remindAt: second });
  assert.equal(result.status, 200);
  assert.equal(result.data.note.remindAt, second, "changing the reminder replaces its time");
  result = await owner.call("note-save", { id, body: "Keep the deadline." });
  assert.equal(result.status, 200);
  assert.equal(result.data.note.remindAt, second, "saving other note fields preserves the reminder");

  result = await owner.call("note-reminder", { id, remindAt: "2000-01-01T00:00:00Z" });
  assert.deepEqual(result, { status: 422, data: { error: "Choose a time in the future." } });
  assert.equal((await read()).remindAt, second, "a rejected past time does not replace the reminder");
  for (const bad of ["2026-02-30T09:00:00Z", "tomorrow", [second]]) {
    assert.equal((await owner.call("note-reminder", { id, remindAt: bad })).status, 422);
  }

  // Card 246: only an accepted friend can be invited.
  await owner.call("friend-request", { email: reader.email });
  await reader.call("friend-respond", { id: (await reader.call("friends")).data.incoming[0].id, accept: true });
  assert.equal((await owner.call("note-invite", { id, email: reader.email })).status, 200);
  assert.equal((await reader.call("note-reminder", { id, remindAt: first })).status, 403,
    "a view-only collaborator cannot change the reminder");
  const signedOut = client();
  await signedOut.call("session");
  assert.equal((await signedOut.call("note-reminder", { id, remindAt: first })).status, 401);

  result = await owner.call("note-reminder", { id, remindAt: null });
  assert.equal(result.status, 200);
  assert.equal(result.data.note.remindAt, null);
  assert.equal((await read()).remindAt, null, "the removed reminder stays removed");
  console.log("PASS: card 77 saves, changes, validates, and removes note reminders with permissions");
} finally {
  for (const person of [owner, reader]) {
    if (person.registered) await person.call("delete", { currentPassword: password });
  }
}
