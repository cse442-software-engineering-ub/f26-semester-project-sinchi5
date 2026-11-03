// HTTP contract for cards 120 and 79. Apply migrations 001 through 007 on an isolated local database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php";
const url = new URL(endpoint);
assert(["localhost", "127.0.0.1"].includes(url.hostname) && process.env.NOTELY_TEST_ISOLATED === "1",
  "Run against an isolated local test database with NOTELY_TEST_ISOLATED=1.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
const password = "Sample meadow password 42!";

function client() {
  return {
    cookie: "", csrf: "", registered: false, email: "",
    async call(route, body, headers = {}) {
      const response = await fetch(`${endpoint}?route=${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: this.cookie,
          Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
      });
      for (const cookie of response.headers.getSetCookie()) this.cookie = cookie.split(";")[0];
      const data = await response.json();
      if (data.csrfToken) this.csrf = data.csrfToken;
      assert.equal(response.headers.get("cache-control"), "no-store");
      return { status: response.status, data };
    },
  };
}

const studentA = client();
const studentB = client();
const anonymous = client();
try {
  for (const person of [studentA, studentB, anonymous]) await person.call("session");
  for (const [person, name] of [[studentA, "Student A"], [studentB, "Student B"]]) {
    person.email = `notely-server-${randomUUID()}@example.edu`;
    assert.equal((await person.call("register", { name, email: person.email, password })).status, 201);
    person.registered = true;
  }
  const titles = async (person) => (await person.call("notes")).data.notes.map((note) => note.title);

  // Task #79 / Story #19: real HTTP saves and fresh reads exercise both official
  // task tests, then verify legacy saves, history, permissions and re-login persistence.
  const taskCreated = await studentA.call("note-create", { title: "Tasks", body: "Keep body", category: "Work", tags: ["exam"] });
  assert.equal(taskCreated.status, 201);
  const taskId = taskCreated.data.note.id;
  assert.deepEqual(taskCreated.data.note.checklist, []);
  const taskRead = async () => (await studentA.call(`note&id=${taskId}`)).data.note;
  const taskSave = async (checklist) => {
    const saved = await studentA.call("note-save", { id: taskId, checklist });
    assert.equal(saved.status, 200);
    return saved.data.note;
  };
  const first = [{ text: "Task A", done: true }, { text: "Task B", done: false }];
  const second = [{ text: "Task B", done: false }, { text: "Task C", done: false }];
  await studentA.call("note-pin", { id: taskId, pinned: true });
  await taskSave(first);
  assert.deepEqual((await taskRead()).checklist, first);
  console.log("PASS: Task #79 Test 1: ordered items and boolean states survive save/fetch");
  await taskSave([...second, { text: "  ", done: false }, { text: "\t\n\u00a0", done: false }]);
  assert.deepEqual((await taskRead()).checklist, second);
  console.log("PASS: Task #79 Test 2: replacement removes old and whitespace-only items");
  await taskSave([{ text: "Task B", done: true }]);
  assert.deepEqual((await taskRead()).checklist, [{ text: "Task B", done: true }]);
  await taskSave([{ text: "Task B", done: false }]);
  assert.deepEqual((await taskRead()).checklist, [{ text: "Task B", done: false }]);
  await taskSave([]);
  assert.deepEqual((await taskRead()).checklist, []);
  await taskSave(first);
  const before = await taskRead();
  for (const key of ["title", "body", "category", "tags", "ownerId", "createdAt"]) {
    assert.deepEqual(before[key], taskCreated.data.note[key]);
  }
  assert.equal(before.pinned, true);
  assert.deepEqual((await studentA.call(`note-versions&id=${taskId}`)).data.versions, []);
  assert.deepEqual((await studentA.call("notes")).data.notes.find((n) => n.id === taskId).checklist, first);
  for (const invalid of [null, {}, "[]", [null], [{ text: 4, done: false }], [{ text: "A", done: "false" }], [{ text: "A" }]]) {
    assert.equal((await studentA.call("note-save", { id: taskId, title: "Must not persist", checklist: invalid })).status, 422);
    assert.deepEqual(await taskRead(), before);
  }
  assert.equal((await studentA.call("note-save", { id: taskId, checklist: [{ text: "x".repeat(9000), done: false }] })).status, 413);
  const malformed = await fetch(`${endpoint}?route=note-save`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: '{"checklist":[',
  });
  assert.equal(malformed.status, 400);
  for (const [person, status] of [[anonymous, 401], [studentB, 403]]) {
    assert.equal((await person.call("note-save", { id: taskId, checklist: [] })).status, status);
  }
  assert.equal((await studentA.call("note-save", { id: taskId, checklist: [] }, { "X-CSRF-Token": "forged" })).status, 403);
  await studentA.call("note-invite", { id: taskId, email: studentB.email });
  assert.equal((await studentB.call("note-save", { id: taskId, checklist: [] })).status, 403);
  const bId = (await studentA.call(`note-collaborators&id=${taskId}`)).data.collaborators[0].id;
  await studentA.call("note-permission", { id: taskId, userId: bId, permission: "edit" });
  assert.equal((await studentB.call("note-save", { id: taskId, checklist: second })).status, 200);
  assert.deepEqual((await taskRead()).checklist, second);
  // Legacy title/body saves create text versions and never erase current tasks.
  assert.equal((await studentA.call("note-save", { id: taskId, title: "Tasks revised", body: "New body" })).status, 200);
  assert.deepEqual((await taskRead()).checklist, second);
  const history = (await studentA.call(`note-versions&id=${taskId}`)).data.versions;
  assert.equal(history.length, 1);
  const restored = await studentA.call("note-restore", { id: taskId, versionId: history[0].id });
  assert.equal(restored.data.note.body, "Keep body");
  assert.deepEqual(restored.data.note.checklist, second);
  assert.equal((await studentA.call("logout", {})).status, 200);
  studentA.cookie = "";
  await studentA.call("session");
  assert.equal((await studentA.call("login", { email: studentA.email, password })).status, 200);
  assert.deepEqual((await taskRead()).checklist, second);
  assert.equal((await studentA.call("note-delete", { id: taskId })).status, 200);
  const withTasks = await studentA.call("note-create", { title: "Initial tasks", checklist: first });
  assert.equal(withTasks.status, 201);
  assert.deepEqual(withTasks.data.note.checklist, first);
  await studentA.call("note-delete", { id: withTasks.data.note.id });
  console.log("PASS: Task #79 empty/toggle/remove, metadata, validation atomicity, legacy saves, history/restore, access/CSRF and new-session persistence");

  // Student A creates and shares a note with Student B.
  const created = await studentA.call("note-create", {
    title: "Shared study guide", body: "Chapter 1", courseId: "cse442", lectureDate: "2026-10-05", tags: ["exam"],
  });
  assert.equal(created.status, 201);
  const id = created.data.note.id;
  assert.deepEqual(created.data.note.tags, ["exam"]);
  assert.equal((await studentA.call("note-save", { id, title: "Shared study guide", body: "Chapter 2", visibility: "shared" })).status, 200);
  assert.equal((await studentA.call("note-invite", { id, email: `missing-${randomUUID()}@example.edu` })).status, 404);
  const invited = await studentA.call("note-invite", { id, email: studentB.email });
  assert.equal(invited.status, 200);
  assert.equal(invited.data.collaborator.permission, "view");
  assert.equal((await studentA.call("note-comment", { id, body: "Read chapter 2 first." })).status, 200);

  // Student B can open it but cannot delete or reshare it.
  assert.deepEqual(await titles(studentB), ["Shared study guide"]);
  const opened = await studentB.call(`note&id=${id}`);
  assert.equal(opened.status, 200);
  assert.equal(opened.data.note.body, "Chapter 2");
  assert.equal((await studentB.call(`note-comments&id=${id}`)).data.comments.length, 1);
  assert.equal((await studentB.call("note-delete", { id })).status, 403);
  assert.equal((await studentB.call("note-invite", { id, email: studentA.email })).status, 403);

  // Request checks on the new routes.
  assert.equal((await anonymous.call("notes")).status, 401);
  assert.equal((await studentA.call("note-save", { id, title: "Forged", body: "" }, { "X-CSRF-Token": "forged" })).status, 403);
  assert.equal((await studentA.call("note-pin", { id, pinned: "yes" })).status, 422);
  assert.equal((await studentA.call("notes", {})).status, 405);

  // Student A deletes it; Student B loses the note and its comments.
  assert.equal((await studentA.call("note-delete", { id })).status, 200);
  assert.deepEqual(await titles(studentA), []);
  assert.deepEqual(await titles(studentB), []);
  const gone = await studentB.call(`note&id=${id}`);
  assert.equal(gone.status, 404);
  assert.equal(gone.data.error, "This note could not be found.");
  assert.equal((await studentB.call(`note-comments&id=${id}`)).status, 404);
  console.log("PASS: card 120 HTTP sharing, collaborator access, owner-only delete, lost access after delete, request checks");
} finally {
  for (const person of [studentA, studentB]) {
    if (!person.registered) continue;
    try {
      assert.equal((await person.call("delete", { currentPassword: password })).status, 200);
    } catch {
      console.error("Test account cleanup failed; remove the notely-server account created by this run on DEV/TEST.");
    }
  }
}
