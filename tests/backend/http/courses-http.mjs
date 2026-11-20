// Card 141: real HTTP tests for courses and hand-made events. Needs a disposable local database with
// migrations through 023: NOTELY_TEST_ISOLATED=1 NOTELY_TEST_URL=http://127.0.0.1:8141/api/index.php node tests/backend/http/courses-http.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = new URL(process.env.NOTELY_TEST_URL || "http://127.0.0.1:8080/api/index.php");
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Use a local disposable DEV/TEST API only.");
assert.equal(process.env.NOTELY_TEST_ISOLATED, "1", "Set NOTELY_TEST_ISOLATED=1 once the API uses a disposable database.");
const origin = process.env.NOTELY_TEST_ORIGIN || url.origin;
// For single-worker PHP dev servers, start a second worker on another local port.
const peer = new URL(process.env.NOTELY_TEST_PEER_URL || url);
assert.equal(peer.hostname, url.hostname);
const password = `Course meadow ${randomUUID()}!`;

function client() {
  return {
    cookie: "", csrf: "", email: `notely-courses-${randomUUID()}@example.edu`,
    async call(route, body, { raw, method, query = "", endpoint = url } = {}) {
      const target = new URL(endpoint);
      target.search = `?route=${route}${query}`;
      const post = body !== undefined;
      const response = await fetch(target, {
        method: method ?? (post ? "POST" : "GET"),
        headers: { Cookie: this.cookie, Origin: origin, ...(post ? { "Content-Type": "application/json", "X-CSRF-Token": this.csrf } : {}) },
        ...(post ? { body: raw ?? JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(10000),
      });
      for (const c of response.headers.getSetCookie()) this.cookie = c.split(";")[0];
      const data = await response.json();
      if (data.csrfToken) this.csrf = data.csrfToken;
      return { status: response.status, data };
    },
    async join() {
      await this.call("session");
      assert.equal((await this.call("register", { name: "Casey", email: this.email, password })).status, 201);
      await this.call("session");
    },
  };
}
const a = client(), b = client();
let passed = 0;
const pass = (what) => { passed++; console.log(`PASS ${passed}: ${what}`); };
const err = (r, status, message) => assert.deepEqual([r.status, r.data], [status, { error: message }]);
const course = { code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const event = { courseId: "c-1", title: "Study group", kind: "other", date: "2026-11-20", time: "14:30", location: "Capen 1", description: "Bring notes" };
const XSS = "<script>alert(1)</script>'; DROP TABLE notely_events; --";

await a.join(); await b.join();
try {
  // Signed out, wrong method, size.
  const out = client(); await out.call("session");
  for (const [route, body] of [["courses"], ["course-save", {}], ["course-delete", {}], ["event-save", {}]]) err(await out.call(route, body), 401, "Sign in to continue.");
  pass("every new route answers 401 when signed out");
  err(await a.call("courses", {}), 405, "This request method is not supported.");
  err(await a.call("course-save", undefined, { method: "GET" }), 405, "This request method is not supported.");
  pass("wrong method is 405");
  err(await a.call("course-save", {}, { raw: JSON.stringify({ name: "x".repeat(9000) }) }), 413, "This request is too large.");
  pass("a body over 8 KB is 413");

  // Courses: empty, create (server id), create (adopted id), update, list sizes.
  assert.deepEqual((await a.call("courses")).data, { courses: [] });
  const made = await a.call("course-save", course);
  assert.equal(made.status, 200);
  assert.match(made.data.course.id, /^[A-Za-z0-9_-]{1,64}$/);
  assert.deepEqual({ ...made.data.course, id: "" }, { id: "", ...course });
  assert.equal((await a.call("courses")).data.courses.length, 1);
  const adopted = await a.call("course-save", { ...course, id: "c-1", code: "CSE 250", classesStart: "2026-08-31", classesEnd: "2026-12-11" });
  assert.deepEqual(adopted.data.course, { id: "c-1", ...course, code: "CSE 250", classesStart: "2026-08-31", classesEnd: "2026-12-11" });
  assert.equal((await a.call("courses")).data.courses.length, 2);
  const edited = await a.call("course-save", { ...course, id: "c-1", code: "CSE 250", name: "Algorithms", color: "#ABCDEF" });
  assert.deepEqual([edited.data.course.name, edited.data.course.color, edited.data.course.classesStart], ["Algorithms", "#ABCDEF", undefined]);
  assert.equal((await a.call("courses")).data.courses.length, 2);
  pass("courses: empty, 1, 2; server-made id; adopted id; update in place");

  const listCourses = async (account) => (await account.call("courses")).data.courses;
  const before = await listCourses(a);
  const duplicate = (response) => err(response, 409, "This course has already been added.");
  const qa = { ...course, code: "QA442" };
  const original = await a.call("course-save", qa);
  assert.equal(original.status, 200);
  duplicate(await a.call("course-save", qa));
  duplicate(await a.call("course-save", { ...qa, name: "Different", classesEnd: "2026-12-20", color: "#123456" }));
  assert.deepEqual((await listCourses(a)).filter(c => c.code === qa.code), [original.data.course]);
  pass("exact duplicates and different display fields leave one unchanged original");
  duplicate(await a.call("course-save", { ...course, code: "cse 442", term: "fall 2026" }));
  pass("case-insensitive code and term");
  duplicate(await a.call("course-save", { ...course, code: "  CSE 442\u00a0", term: "\u2003Fall 2026 " }));
  pass("Unicode and ASCII edge whitespace");
  const spring = await a.call("course-save", { ...course, term: "Spring 2027" });
  assert.equal(spring.status, 200);
  assert.notEqual(spring.data.course.id, made.data.course.id);
  pass("another term creates a separate course");
  const other = await b.call("course-save", course);
  assert.equal(other.status, 200);
  assert.deepEqual(await listCourses(b), [other.data.course]);
  assert.ok(!(await listCourses(a)).some(c => c.id === other.data.course.id));
  pass("another account independently owns the same identity");
  const prior = await listCourses(a);
  duplicate(await a.call("course-save", { ...course, id: "c-1", name: "Rejected" }));
  assert.deepEqual(await listCourses(a), prior);
  pass("conflicting updates preserve both courses");
  const race = { ...course, code: "Concurrent" };
  const results = await Promise.all([a.call("course-save", race), a.call("course-save", race, { endpoint: peer })]);
  results.sort((left, right) => left.status - right.status);
  assert.equal(results[0].status, 200);
  duplicate(results[1]);
  assert.deepEqual((await listCourses(a)).filter(c => c.code === race.code), [results[0].data.course]);
  pass("two simultaneous creates produce one saved course and one controlled conflict");
  for (const saved of [original, spring, results[0]]) assert.equal((await a.call("course-delete", { id: saved.data.course.id })).status, 200);
  assert.equal((await b.call("course-delete", { id: other.data.course.id })).status, 200);
  assert.deepEqual(await listCourses(a), before);

  // Another student.
  assert.deepEqual((await b.call("courses")).data, { courses: [] });
  err(await b.call("course-save", { ...course, id: "c-1", name: "Mine now" }), 404, "This course could not be found.");
  err(await b.call("course-delete", { id: "c-1" }), 404, "This course could not be found.");
  assert.equal((await a.call("courses")).data.courses.find((c) => c.id === "c-1").name, "Algorithms");
  pass("another student's course is 404 and untouched");

  // Validation.
  const bad = async (patch, message) => err(await a.call("course-save", { ...course, ...patch }), 422, message);
  await bad({ code: undefined }, "Enter a course code of 1 to 64 visible characters.");
  await bad({ code: "" }, "Enter a course code of 1 to 64 visible characters.");
  await bad({ code: "x".repeat(65) }, "Enter a course code of 1 to 64 visible characters.");
  await bad({ name: "   " }, "Enter a course name of 1 to 255 visible characters.");
  await bad({ name: "x".repeat(256) }, "Enter a course name of 1 to 255 visible characters.");
  await bad({ name: "a\tb" }, "Enter a course name of 1 to 255 visible characters.");
  await bad({ term: 5 }, "Enter a term of 1 to 64 visible characters.");
  await bad({ color: "red" }, "Choose a course color.");
  await bad({ color: "#12345" }, "Choose a course color.");
  await bad({ color: "#12345g" }, "Choose a course color.");
  await bad({ id: "bad id!" }, "Choose a valid course.");
  await bad({ id: "x".repeat(65) }, "Choose a valid course.");
  await bad({ classesStart: "2026-02-30" }, "Choose real class start and end dates.");
  await bad({ classesStart: "2026-09-01", classesEnd: "2026-09-01" }, "Choose a class end date after the start date.");
  err(await a.call("course-delete", { id: "no spaces" }), 422, "Choose a valid course.");
  pass("every course validation rule");

  // Injection text is stored and returned as text.
  const x = await a.call("course-save", { ...course, name: XSS, code: "<b>x</b>" });
  assert.equal(x.status, 200);
  assert.deepEqual([x.data.course.name, x.data.course.code], [XSS, "<b>x</b>"]);
  assert.equal((await a.call("courses")).data.courses.find((c) => c.id === x.data.course.id).name, XSS);
  await a.call("course-delete", { id: x.data.course.id });
  pass("script and SQL text in a course is stored and returned as plain text");

  // Events.
  assert.deepEqual((await a.call("events")).data, { events: [] });
  const e1 = await a.call("event-save", event);
  assert.equal(e1.status, 201);
  assert.match(e1.data.event.id, /^[1-9][0-9]*$/);
  assert.deepEqual({ ...e1.data.event, id: "" }, { id: "", courseId: "c-1", title: "Study group", kind: "other", date: "2026-11-20", time: "14:30",
    location: "Capen 1", description: "Bring notes", source: "manual", importJobId: null, seriesId: null });
  const repeat = { every: 2, days: [1, 3], until: "2026-12-20" };
  const e2 = await a.call("event-save", { ...event, title: "Office hours", repeat });
  assert.deepEqual(e2.data.event.repeat, repeat);
  const list = (await a.call("events")).data.events;
  assert.deepEqual(list.map((e) => e.title), ["Study group", "Office hours"]);
  assert.deepEqual(list[1].repeat, repeat); assert.equal(list[0].repeat, undefined); assert.equal(list[0].description, "Bring notes");
  const upd = await a.call("event-save", { ...event, id: e1.data.event.id, title: "Renamed", time: "", repeat });
  assert.deepEqual([upd.status, upd.data.event.id, upd.data.event.title, upd.data.event.time, upd.data.event.source], [200, e1.data.event.id, "Renamed", "", "manual"]);
  assert.equal((await a.call("events")).data.events.length, 2);
  const noRepeat = await a.call("event-save", { ...event, id: e1.data.event.id });
  assert.equal(noRepeat.data.event.repeat, undefined);
  pass("events: empty, create 201, repeat, list, edit in place, repeat removed");

  // Imported events are edited in place and stay imported.
  const up = await a.call("syllabus-upload", { courseId: "c-1", fileName: "s.txt", content: Buffer.from("CSE 442").toString("base64") });
  await a.call("import-confirm", { id: up.data.job.id, events: [{ title: "Exam 1", kind: "exam", date: "2026-10-10", time: "09:00" }] });
  const imported = (await a.call("events")).data.events.find((e) => e.title === "Exam 1");
  assert.equal(imported.source, "imported");
  const fixed = await a.call("event-save", { ...event, id: imported.id, title: "Exam 1 (moved)", kind: "exam", date: "2026-10-12", description: "Room change" });
  assert.deepEqual([fixed.data.event.source, fixed.data.event.title, fixed.data.event.date, fixed.data.event.importJobId], ["imported", "Exam 1 (moved)", "2026-10-12", up.data.job.id]);
  pass("an imported event is edited in place and keeps source imported");

  // Another student's event and validation.
  err(await b.call("event-save", { ...event, id: e1.data.event.id, title: "Hijack" }), 404, "This event could not be found.");
  assert.deepEqual((await b.call("events")).data, { events: [] });
  assert.equal((await a.call("events")).data.events.find((e) => e.id === e1.data.event.id).title, "Study group");
  err(await a.call("event-save", { ...event, id: "99999999" }), 404, "This event could not be found.");
  err(await a.call("event-save", { ...event, id: "abc" }), 422, "Choose a valid event.");
  pass("another student's event is 404 and untouched");
  const ebad = async (patch, message) => err(await a.call("event-save", { ...event, ...patch }), 422, message);
  await ebad({ courseId: "bad id" }, "Choose a course for this event.");
  await ebad({ title: "" }, "Give every event a title and a date.");
  await ebad({ title: "x".repeat(256) }, "Keep each event title to 255 visible characters.");
  await ebad({ kind: "party" }, "Choose a valid event type.");
  await ebad({ date: "2026-02-30" }, "Choose a real date for every event.");
  await ebad({ time: "25:00" }, "Use a 24-hour time like 10:00.");
  await ebad({ location: "x".repeat(121) }, "Keep each location to 120 visible characters.");
  await ebad({ description: "x".repeat(2001) }, "Keep each description to 2000 visible characters.");
  await ebad({ description: 5 }, "Keep each description to 2000 visible characters.");
  const rmsg = "Choose 1 or 2 weeks, at least one day, and an end date within a year of the start.";
  for (const r of [{ ...repeat, every: 3 }, { ...repeat, days: [] }, { ...repeat, days: [7] }, { ...repeat, days: [1, 1] }, { ...repeat, days: ["1"] },
    { ...repeat, until: "2026-11-19" }, { ...repeat, until: "2027-11-21" }, { ...repeat, until: "nope" }, "weekly", 5]) await ebad({ repeat: r }, rmsg);
  assert.equal((await a.call("event-save", { ...event, description: "line 1\nline 2", repeat: { ...repeat, until: "2027-11-20" } })).status, 201);
  pass("every event validation rule (a multi-line description and a one-year repeat are accepted)");
  const xe = await a.call("event-save", { ...event, title: XSS, description: XSS });
  assert.deepEqual([xe.data.event.title, xe.data.event.description], [XSS, XSS]);
  pass("script and SQL text in an event is stored and returned as plain text");

  // course-delete removes events, detaches notes, keeps the others.
  const note = await a.call("note-create", { title: "Lecture", body: "text", courseId: "c-1" });
  assert.equal(note.status, 201);
  const eventsBeforeEdit = (await a.call("events")).data.events;
  const secondEdit = await a.call("course-save", { ...edited.data.course, name: "Updated", color: "#123456" });
  assert.deepEqual(secondEdit.data.course, { ...edited.data.course, name: "Updated", color: "#123456" });
  assert.equal((await listCourses(a)).length, 2);
  assert.deepEqual((await a.call("events")).data.events, eventsBeforeEdit);
  assert.equal((await a.call("note", undefined, { query: `&id=${note.data.note.id}` })).data.note.courseId, "c-1");
  pass("same-ID edit preserves linked events and note");
  assert.deepEqual((await a.call("course-delete", { id: "c-1" })).data, { deleted: true });
  assert.deepEqual((await a.call("events")).data.events, []);
  const kept = (await a.call("note", undefined, { query: `&id=${note.data.note.id}` })).data.note;
  assert.deepEqual([kept.body, kept.courseId], ["<p>text</p>", ""]);
  assert.equal((await a.call("courses")).data.courses.length, 1);
  err(await a.call("course-delete", { id: "c-1" }), 404, "This course could not be found.");
  pass("deleting a course removes its events, keeps its notes without a course, and leaves other courses");

  // Caps: 50 courses, 500 hand-made events.
  const have = (await a.call("courses")).data.courses.length;
  for (let i = have; i < 50; i++) assert.equal((await a.call("course-save", { ...course, code: `C${i}` })).status, 200);
  err(await a.call("course-save", course), 422, "You can have at most 50 courses.");
  assert.equal((await a.call("course-save", { ...course, id: made.data.course.id, name: "Renamed" })).status, 200);
  pass("at most 50 courses");
  for (let i = 0; i < 500; i++) assert.equal((await a.call("event-save", { ...event, title: `E${i}` })).status, 201);
  err(await a.call("event-save", event), 422, "You can add at most 500 events of your own.");
  assert.equal((await a.call("events")).data.events.length, 500);
  assert.equal((await a.call("events", undefined, { query: "&courseId=nothing" })).data.events.length, 0);
  pass("at most 500 hand-made events; the list of 500 comes back");
} finally {
  for (const p of [a, b]) await p.call("delete", { currentPassword: password }).catch(() => {});
}
console.log(`courses-http: ${passed} groups passed`);
