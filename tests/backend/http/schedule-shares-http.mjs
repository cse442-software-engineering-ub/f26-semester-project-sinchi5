// Card 143 HTTP contract for sharing a course schedule view only. Run only against DEV or TEST with
// migrations through 021 applied. It makes its own accounts and deletes them at the end.
// Locally: NOTELY_TEST_ISOLATED=1 NOTELY_TEST_URL=http://127.0.0.1:8080/api/index.php NOTELY_TEST_ORIGIN=http://127.0.0.1:5173 node tests/backend/http/schedule-shares-http.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const endpoint = new URL(process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php");
assert(["localhost", "127.0.0.1", "aptitude.cse.buffalo.edu"].includes(endpoint.hostname), "Run schedule sharing tests only on DEV or TEST.");
assert(endpoint.hostname === "aptitude.cse.buffalo.edu" || process.env.NOTELY_TEST_ISOLATED === "1",
  "Confirm the local API uses an isolated DEV database, then set NOTELY_TEST_ISOLATED=1. No requests sent.");
const origin = process.env.NOTELY_TEST_ORIGIN || endpoint.origin;
const password = `Schedule meadow ${randomUUID()}!`;

function client(name) {
  return {
    name, cookie: "", csrf: "", registered: false,
    email: `notely-schedule-${randomUUID()}@example.edu`,
    async call(route, body, query = "") {
      const url = new URL(endpoint);
      url.search = `?route=${route}${query}`;
      const response = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: { Cookie: this.cookie, Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error", signal: AbortSignal.timeout(15000),
      });
      for (const c of response.headers.getSetCookie()) this.cookie = c.split(";")[0];
      const data = await response.json();
      if (data.csrfToken) this.csrf = data.csrfToken;
      return { status: response.status, data };
    },
    async join() {
      await this.call("session");
      assert.equal((await this.call("register", { name: this.name, email: this.email, password })).status, 201);
      this.registered = true;
      await this.call("session");
    },
  };
}

const owner = client("Share Owner"), viewer = client("Share Viewer"), other = client("Share Other");
let passed = 0;
const pass = (what) => { passed++; console.log(`PASS ${passed}: ${what}`); };
const err = (r, status, message) => assert.deepEqual([r.status, r.data], [status, { error: message }]);
const course = { code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const ids = (list) => list.map((x) => x.id);

try {
  for (const c of [owner, viewer, other]) await c.join();
  const out = client("Signed out"); await out.call("session");
  for (const [route, body, query] of [["schedule-shares", undefined, "&courseId=x"], ["schedule-share", { courseId: "x", email: viewer.email }],
    ["schedule-unshare", { courseId: "x", userId: "1" }]]) err(await out.call(route, body, query), 401, "Sign in to continue.");
  err(await owner.call("schedule-share", undefined), 405, "This request method is not supported.");
  err(await owner.call("schedule-shares", {}), 405, "This request method is not supported.");
  pass("signed out is 401 and the wrong method is 405");

  // The owner's course and two events: one hand-made, one later.
  const mine = (await owner.call("course-save", course)).data.course;
  const study = await owner.call("event-save", { courseId: mine.id, title: "Study session", kind: "other", date: "2026-11-20", time: "19:00", location: "", description: "" });
  assert.equal(study.status, 201);
  assert.deepEqual((await owner.call("schedule-shares", undefined, `&courseId=${mine.id}`)).data, { shares: [] });
  assert.deepEqual((await viewer.call("courses")).data, { courses: [] });
  assert.deepEqual((await viewer.call("events")).data, { events: [] });
  pass("before sharing, nothing reaches the classmate and the owner's list is empty");

  // Task test 1: sharing reaches the classmate, view only.
  const shared = await owner.call("schedule-share", { courseId: mine.id, email: ` ${viewer.email.toUpperCase()} ` });
  assert.equal(shared.status, 201);
  const viewerId = shared.data.share.userId;
  assert.deepEqual(shared.data, { share: { userId: viewerId, name: "Share Viewer", email: viewer.email, permission: "view" } });
  assert.deepEqual((await owner.call("schedule-shares", undefined, `&courseId=${mine.id}`)).data, { shares: [shared.data.share] });
  const ownerId = (await owner.call("session")).data.user.id;
  const sharedBy = { id: ownerId, name: "Share Owner" };
  assert.deepEqual((await viewer.call("courses")).data.courses, [{ ...mine, sharedBy }]);
  const seen = (await viewer.call("events")).data.events;
  assert.deepEqual(seen, [{ ...study.data.event, sharedBy }]);
  assert.deepEqual((await viewer.call("events", undefined, `&courseId=${mine.id}`)).data.events, seen);
  pass("schedule-share is 201 with permission view; the classmate's courses and events show it with sharedBy");

  // An event the owner adds later reaches the classmate; the owner's own lists are unchanged.
  const lab = (await owner.call("event-save", { courseId: mine.id, title: "Lab report", kind: "deadline", date: "2026-11-23", time: "", location: "", description: "" })).data.event;
  assert.deepEqual(ids((await viewer.call("events")).data.events), [study.data.event.id, lab.id]);
  assert.deepEqual((await owner.call("courses")).data.courses, [mine]);
  assert.equal((await owner.call("events")).data.events.some((e) => e.sharedBy), false);
  assert.deepEqual((await other.call("courses")).data, { courses: [] });
  assert.deepEqual((await other.call("events")).data, { events: [] });
  pass("new events reach the classmate; the owner and other students see no sharedBy rows");

  // Task test 2: the classmate can't change the owner's schedule.
  const base = { courseId: mine.id, title: "Mine now", kind: "other", date: "2026-11-21", time: "", location: "", description: "" };
  err(await viewer.call("event-save", base), 403, "You do not have permission to edit this schedule.");
  err(await viewer.call("event-save", { ...base, id: study.data.event.id }), 403, "You do not have permission to edit this schedule.");
  err(await viewer.call("event-save", { ...base, courseId: "viewer-own", id: study.data.event.id }), 404, "This event could not be found.");
  err(await viewer.call("event-delete", { id: study.data.event.id }), 404, "This event could not be found.");
  err(await viewer.call("course-save", { ...course, id: mine.id, name: "Mine now" }), 404, "This course could not be found.");
  err(await viewer.call("course-delete", { id: mine.id }), 404, "This course could not be found.");
  err(await viewer.call("syllabus-upload", { courseId: mine.id, fileName: "s.txt", content: "" }), 403, "You do not have permission to edit this schedule.");
  err(await viewer.call("schedule-shares", undefined, `&courseId=${mine.id}`), 422, "Choose a valid course.");
  err(await viewer.call("schedule-share", { courseId: mine.id, email: other.email }), 422, "Choose a valid course.");
  err(await viewer.call("schedule-unshare", { courseId: mine.id, userId: viewerId }), 422, "Choose a valid course.");
  const after = (await owner.call("events")).data.events;
  assert.deepEqual(after.map((e) => [e.title, e.date]), [["Study session", "2026-11-20"], ["Lab report", "2026-11-23"]]);
  assert.deepEqual((await owner.call("courses")).data.courses, [mine]);
  pass("the classmate's adds, edits, deletes, uploads and share calls are refused; the owner's schedule is unchanged");

  // Task test 3: bad shares are refused.
  const bad = async (body, status, message) => err(await owner.call("schedule-share", { courseId: mine.id, ...body }), status, message);
  await bad({ email: "nobody-here-442@example.edu" }, 404, "No registered account was found for this email.");
  await bad({ email: owner.email }, 422, "You can’t share a schedule with yourself.");
  await bad({ email: viewer.email }, 409, "This schedule is already shared with that person.");
  await bad({ email: "name@school" }, 422, "Enter a complete email address, like name@university.edu.");
  await bad({ email: "not an email" }, 422, "Email addresses can’t contain spaces.");
  await bad({ email: "" }, 422, "Enter your email address.");
  await bad({ email: 42 }, 422, "Complete all required fields.");
  await bad({ courseId: "nope", email: other.email }, 422, "Choose a valid course.");
  await bad({ courseId: "../x", email: other.email }, 422, "Choose a valid course.");
  const otherCourse = (await other.call("course-save", { ...course, code: "MTH 241" })).data.course;
  await bad({ courseId: otherCourse.id, email: viewer.email }, 422, "Choose a valid course.");
  assert.deepEqual((await owner.call("schedule-shares", undefined, `&courseId=${mine.id}`)).data.shares.map((s) => s.name), ["Share Viewer"]);
  pass("unknown, own, duplicate, malformed emails and someone else's course are refused; the classmate is listed once");

  // Task test 4: unsharing removes access, and a repeat changes nothing.
  err(await owner.call("schedule-unshare", { courseId: mine.id, userId: "abc" }), 422, "Choose a valid classmate.");
  const stopped = await owner.call("schedule-unshare", { courseId: mine.id, userId: viewerId });
  assert.deepEqual([stopped.status, stopped.data], [200, { shares: [] }]);
  assert.deepEqual((await owner.call("schedule-unshare", { courseId: mine.id, userId: viewerId })).data, { shares: [] });
  assert.deepEqual((await viewer.call("courses")).data, { courses: [] });
  assert.deepEqual((await viewer.call("events")).data, { events: [] });
  pass("schedule-unshare is 200; the classmate no longer sees the course or its events");

  // Deleting the course removes its shares.
  assert.equal((await owner.call("schedule-share", { courseId: mine.id, email: viewer.email })).status, 201);
  assert.equal((await viewer.call("courses")).data.courses.length, 1);
  assert.equal((await owner.call("course-delete", { id: mine.id })).status, 200);
  assert.deepEqual((await viewer.call("courses")).data, { courses: [] });
  assert.deepEqual((await viewer.call("events")).data, { events: [] });
  pass("deleting the course stops sharing it");

  // Deleting the owner's account removes the share too.
  const again = (await owner.call("course-save", course)).data.course;
  assert.equal((await owner.call("schedule-share", { courseId: again.id, email: viewer.email })).status, 201);
  assert.equal((await owner.call("delete", { currentPassword: password })).status, 200);
  owner.registered = false;
  assert.deepEqual((await viewer.call("courses")).data, { courses: [] });
  pass("deleting the owner's account stops sharing");
  console.log("PASS: course schedules are shared view only by email, refused when invalid, and unshared");
} finally {
  for (const c of [owner, viewer, other]) if (c.registered) await c.call("delete", { currentPassword: password }).catch(() => {});
}
