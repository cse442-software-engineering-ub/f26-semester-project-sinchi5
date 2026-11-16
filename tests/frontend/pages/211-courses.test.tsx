// Frontend test: the real Courses page, Settings and a course page with the API replaced. Every request must be scripted.
import "@fontsource-variable/inter";
import "../../../src/app/global.css";
import "../../../src/app/App.module.css";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byLabel, byText, click, type, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";

page({ card: "211", title: "Frontend: Courses page with Add course and Upload syllabus", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const signedIn = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const cse442 = { id: "c1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const cse250 = { id: "c2", code: "CSE 250", name: "Data Structures", color: "#7A8D9D", term: "Fall 2026" };
const note = (id: string, courseId: string) => ({ id, courseId, title: "Note " + id, body: "", lectureDate: "2026-09-01", category: "School", tags: [], pinned: false, updatedAt: "2026-09-01T12:00:00Z" });
const exam = { id: "e1", courseId: "c1", title: "Midterm exam", kind: "exam", date: "2099-01-05", time: "10:00", location: "", description: "", source: "manual", seriesId: null };
const PAGE = "src/features/courses.tsx → Courses";
const routes = (courses: object[] = [], extra: Record<string, unknown> = {}) => ({
  session: signedIn, notes: { notes: [] }, events: { events: [] }, courses: { courses }, "course-notes-shares": { shares: [] }, ...extra,
});
const ui = (path: string) => <MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>;
const inMain = (root: Element, name: string) => [...root.querySelectorAll<HTMLElement>("main button")].find((b) => (b.textContent ?? "").trim() === name) ?? null;
const card = (root: Element, id: string) => root.querySelector(`main a[href="/courses/${id}"]`);

await test("1. A student with no courses sees a blank page, or is missing Add course or Upload syllabus", PAGE, async () => {
  stubApi(routes());
  const root = mount(ui("/courses"));
  await waitFor(() => byText("No courses yet"));
  expect(byRole("heading", "Courses") !== null).toBe(true);
  expect(inMain(root, "Add course") !== null).toBe(true);
  expect(inMain(root, "Upload syllabus") !== null).toBe(true);
});
await test("2. A course card does not show its code, name and term, or there is not one card per course", PAGE, async () => {
  stubApi(routes([cse442, cse250]));
  const root = mount(ui("/courses"));
  await waitFor(() => root.querySelectorAll('main a[href^="/courses/"]').length === 2);
  const first = card(root, "c1")?.textContent ?? "";
  for (const want of ["CSE 442", "Software Engineering", "Fall 2026"]) expect(first.includes(want)).toBe(true);
});
await test("3. The note count is wrong: not '1 note' for one note, or not '2 notes' for two", PAGE, async () => {
  stubApi(routes([cse442, cse250], { notes: { notes: [note("n1", "c1"), note("n2", "c2"), note("n3", "c2")] } }));
  const root = mount(ui("/courses"));
  await waitFor(() => (card(root, "c1")?.textContent ?? "").includes("1 note"));
  expect((card(root, "c2")?.textContent ?? "").includes("2 notes")).toBe(true);
});
await test("4. A course with an upcoming event does not show it on its card", PAGE, async () => {
  const root = (stubApi(routes([cse442], { events: { events: [exam] } })), mount(ui("/courses")));
  await waitFor(() => (card(root, "c1")?.textContent ?? "").includes("Midterm exam"));
});
await test("5. Add course does not open the window, or saving sends no course-save or more than one", "src/features/courses.tsx → Courses, src/features/course-dialog.tsx", async () => {
  const api = stubApi(routes([], { "course-save": (req: { body: Record<string, unknown> }) => ({ course: { id: "c9", ...req.body } }) }));
  const root = mount(ui("/courses"));
  await waitFor(() => byText("No courses yet"));
  await click(inMain(root, "Add course"));
  const dialog = await waitFor(() => byRole("dialog", "Add a course"));
  await type(byLabel("Course code"), "CSE 250");
  await type(byLabel("Course name"), "Data Structures");
  await click([...dialog.querySelectorAll("button")].find((b) => b.textContent === "Add course") as HTMLElement);
  await waitFor(() => api.sent.some((r) => r.route === "course-save"));
  await new Promise((r) => setTimeout(r, 100));
  expect(api.sent.filter((r) => r.route === "course-save").length).toBe(1);
});
await test("6. Upload syllabus does not open the upload window, or it still shows the prototype options", "src/features/courses.tsx → Courses, src/features/imports.tsx → ImportDialog", async () => {
  stubApi(routes([cse442]));
  const root = mount(ui("/courses"));
  await waitFor(() => card(root, "c1"));
  await click(inMain(root, "Upload syllabus"));
  await waitFor(() => byRole("dialog", "Your semester, sorted"));
  expect(byText("Prototype preview options") === null).toBe(true);
  expect(byText("Processing result") === null).toBe(true);
});
await test("7. Settings still lists courses or offers Add course", "src/features/settings.tsx → Settings", async () => {
  stubApi(routes([cse442]));
  const root = mount(ui("/settings"));
  await waitFor(() => byRole("heading", "Appearance"));
  expect(byRole("heading", "Courses") === null).toBe(true);
  expect(inMain(root, "Add course") === null).toBe(true);
  expect(byText("Software Engineering") === null).toBe(true);
});
await test("8. A course page has no Upload syllabus button", "src/features/notes.tsx → CoursePage", async () => {
  stubApi(routes([cse442]));
  const root = mount(ui("/courses/c1"));
  await waitFor(() => inMain(root, "Upload syllabus"));
});
await test("9. The Courses page scrolls sideways on a 320 px phone", "src/features/courses.module.css", async () => {
  const long = (id: string) => ({ ...cse442, id, name: "Software Engineering and Long Names".padEnd(40, "x") });
  stubApi(routes([long("c1"), long("c2")]));
  const root = mount(ui("/courses"), { width: 320 });
  await waitFor(() => root.querySelectorAll('main a[href^="/courses/"]').length === 2);
  expect(pageScrollWidth() <= 320).toBe(true);
});
