// Frontend test: real Provider, repositories and dialogs; API replaced. Every request must be scripted.
import "@fontsource-variable/inter";
import "../../../src/app/global.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byText, byLabel, click, type, waitFor } from "../harness";
import { Provider, useApp } from "../../../src/app/context";
import { AddCourseDialog } from "../../../src/features/course-dialog";
import { EventDialog } from "../../../src/features/schedule";

page({ card: "142", title: "Frontend: Load and save courses and hand-made events through the server", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const session = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const cse442 = { id: "c-1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const studyGroup = { id: "12", courseId: "c-1", title: "Study group", kind: "other", date: "2026-11-20", time: "14:30", location: "Capen 1",
  description: "Bring notes", source: "manual", importJobId: null, seriesId: null, repeat: { every: 2, days: [1, 3], until: "2026-12-20" } };
const midterm = { id: "41", courseId: "c-1", title: "Midterm exam", kind: "exam", date: "2026-10-14", time: "10:00", location: "",
  description: "", source: "imported", importJobId: "9", seriesId: null };
const KEY = "notely-workspace-v1-1";
const SERVICES = "src/services/repositories.ts → schedule / courses, src/services/courses-http.ts";
const ADOPT = "src/services/adopt-browser-workspace.ts → adoptBrowserWorkspace, src/services/app-repositories.ts → session";

// Signed in with one course and two events on the server. Saves echo back what was sent, with an id.
const server = (extra: Record<string, unknown> = {}) => stubApi({
  session, notes: { notes: [] }, courses: { courses: [cse442] }, events: { events: [studyGroup, midterm] },
  "course-save": (req: { body: Record<string, unknown> }) => ({ course: { id: "c-new", ...req.body } }),
  "event-save": (req: { body: Record<string, unknown> }) => ({ status: req.body.id ? 200 : 201, body: { event: { id: "99", source: "manual", ...req.body } } }),
  ...extra,
});
// What the Provider loaded, plus the real dialog this case opens.
function Probe({ open }: { open?: "course" | "new-event" | string }) {
  const { state } = useApp();
  const event = state.events.find((e) => e.id === open);
  return <>
    <ul aria-label="Courses">{state.courses.map((c) => <li key={c.id}>{`Course: ${c.code}`}</li>)}</ul>
    <ul aria-label="Events">{state.events.map((e) => <li key={e.id}>{`Event: ${e.title}`}</li>)}</ul>
    {open === "course" && state.ready && <AddCourseDialog onClose={() => undefined} />}
    {open === "new-event" && state.courses.length > 0 && <EventDialog date="2026-11-24" onClose={() => undefined} />}
    {event && <EventDialog event={event} onClose={() => undefined} />}
  </>;
}
const ui = (open?: string) => <MemoryRouter><Provider><Probe open={open} /></Provider></MemoryRouter>;
const sent = (api: { sent: { route: string }[] }, route: string) => api.sent.filter((r) => r.route === route) as { route: string; body: any; csrf: string | null }[];

await test("1. Courses or events don't come from the server's answers", "src/app/context.tsx → refresh, " + SERVICES, async () => {
  server();
  mount(ui());
  await waitFor(() => byText("Course: CSE 442"));
  await waitFor(() => byText("Event: Study group"));
  expect(byText("Event: Midterm exam") !== null).toBe(true);
});
await test("2. Adding a course sends no course-save, more than one, or different fields", "src/features/course-dialog.tsx → onSubmit, " + SERVICES, async () => {
  const api = server();
  mount(ui("course"));
  await type(await waitFor(() => byLabel("Course code")), "CSE 250");
  await type(byLabel("Course name"), "Data Structures");
  await click(byRole("button", "Add course"));
  await waitFor(() => sent(api, "course-save").length > 0);
  await new Promise((r) => setTimeout(r, 100));
  expect(sent(api, "course-save").length).toBe(1);
  expect(sent(api, "course-save")[0].body).toEqual({ code: "CSE 250", name: "Data Structures", color: "#869d7a", term: "Fall 2026" });
  expect(sent(api, "course-save")[0].csrf).toBe("test-token");
});
await test("3. A new hand-made event is sent with an id (the server refuses browser ids), or isn't sent", SERVICES, async () => {
  const api = server();
  mount(ui("new-event"));
  await type(await waitFor(() => byLabel("Title")), "Office hours");
  await type(byLabel(/^Description/), "Room 301");
  await click(byRole("button", "Create event"));
  await waitFor(() => sent(api, "event-save").length > 0);
  const body = sent(api, "event-save")[0].body;
  expect("id" in body).toBe(false);
  expect([body.courseId, body.title, body.date, body.description]).toEqual(["c-1", "Office hours", "2026-11-24", "Room 301"]);
});
await test("4. Editing a hand-made event loses its id, its repeat or its description", SERVICES, async () => {
  const api = server();
  mount(ui("12"));
  await type(await waitFor(() => byLabel("Title")), "Study group (moved)");
  await click(byRole("button", "Save changes"));
  await waitFor(() => sent(api, "event-save").length > 0);
  const body = sent(api, "event-save")[0].body;
  expect([body.id, body.title, body.description]).toEqual(["12", "Study group (moved)", "Bring notes"]);
  expect(body.repeat).toEqual({ every: 2, days: [1, 3], until: "2026-12-20" });
});
await test("5. Editing an imported event makes a browser copy, or isn't saved over the server's copy", SERVICES, async () => {
  const api = server();
  mount(ui("41"));
  await type(await waitFor(() => byLabel("Title")), "Midterm exam (room 101)");
  await click(byRole("button", "Save changes"));
  await waitFor(() => sent(api, "event-save").length > 0);
  expect([sent(api, "event-save")[0].body.id, sent(api, "event-save")[0].body.title]).toEqual(["41", "Midterm exam (room 101)"]);
  expect(localStorage.length).toBe(Number(localStorage.getItem("notely-theme") !== null));
});
await test("6. Old browser courses and events aren't adopted, are sent twice, or the old copy stays", ADOPT, async () => {
  const oldCourse = { ...cse442, id: "6f1c2a9e-0000-4000-8000-000000000001" };
  const oldEvent = { ...studyGroup, id: "9b2d7c1e-0000-4000-8000-000000000003", courseId: oldCourse.id };
  const editedImport = { ...midterm, title: "Midterm (room 101)" };
  localStorage.setItem(KEY, JSON.stringify({ courses: [oldCourse], notes: [], events: [oldEvent, editedImport], comments: [], versions: [] }));
  const api = server();
  mount(ui());
  await waitFor(() => byText("Course: CSE 442"));
  expect(sent(api, "course-save").map((r) => r.body.id)).toEqual([oldCourse.id]);
  expect(sent(api, "event-save").map((r) => r.body.id ?? "no id")).toEqual(["no id", "41"]);
  expect(localStorage.getItem(KEY)).toBe(null);
});
await test("7. A failed adoption request deletes the old copy anyway (data lost)", ADOPT, async () => {
  const oldCourse = { ...cse442, id: "6f1c2a9e-0000-4000-8000-000000000001" };
  localStorage.setItem(KEY, JSON.stringify({ courses: [oldCourse], notes: [], events: [] }));
  server({ "course-save": { status: 503, body: { error: "Notely is unavailable right now." } } });
  mount(ui());
  await waitFor(() => byText("Course: CSE 442"));
  expect(JSON.parse(localStorage.getItem(KEY) ?? "{}").courses).toEqual([oldCourse]);
});
await test("8. Something is written to browser storage during a normal session", "src/services/* (no localStorage / sessionStorage), src/app/context.tsx", async () => {
  const written: string[] = [];
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key: string, value: string) { if (key !== "notely-theme") written.push(key); return original.call(this, key, value); };
  try {
    const api = server();
    mount(ui("new-event"));
    await type(await waitFor(() => byLabel("Title")), "Office hours");
    await click(byRole("button", "Create event"));
    await waitFor(() => sent(api, "event-save").length > 0);
    await new Promise((r) => setTimeout(r, 100));
  } finally {
    Storage.prototype.setItem = original;
  }
  expect(written).toEqual([]);
  expect(sessionStorage.length).toBe(0);
});
await test("9. A server error on save is hidden, or the form is thrown away", "src/features/schedule.tsx → EventDialog onSubmit, src/services/notes-http.ts → createApiClient", async () => {
  server({ "event-save": { status: 422, body: { error: "Choose a course for this event." } } });
  mount(ui("new-event"));
  await type(await waitFor(() => byLabel("Title")), "Office hours");
  await click(byRole("button", "Create event"));
  await waitFor(() => byText("Choose a course for this event."));
  expect(byLabel("Title")?.value).toBe("Office hours");
  expect(byRole("button", "Create event") !== null).toBe(true);
});
