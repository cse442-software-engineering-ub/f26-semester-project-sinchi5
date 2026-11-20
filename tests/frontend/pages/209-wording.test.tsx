// Frontend test: one name per action, natural counts and dates, with the API replaced. Every request must be scripted.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byText, byLabel, click, waitFor } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";
import { Onboarding } from "../../../src/features/onboarding";
import { dateKey } from "../../../src/services/fixtures";

page({ card: "209", title: "Frontend: One name for each action, natural counts and dates", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const signedIn = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const signedOut = { user: null, onboarding: { completed: false, step: 0 }, csrfToken: "test-token" };
const cse442 = { id: "c1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const note = (id: string) => ({ id, courseId: "c1", title: "Note " + id, body: "", lectureDate: "2026-09-01", category: "School", tags: [], pinned: false, updatedAt: "2026-09-01T12:00:00Z" });
const event = (id: string, date: string, time: string, kind = "assignment") => ({ id, courseId: "c1", title: "Event " + id, kind, date, time, location: "", description: "", source: "manual", seriesId: null });
const today = dateKey();
const routes = (extra: Record<string, unknown> = {}) => ({
  session: signedIn, notes: { notes: [] }, events: { events: [] }, courses: { courses: [cse442] }, "course-notes-shares": { shares: [] },
  "shared-notes": { notes: [] }, friends: { friends: [], incoming: [], outgoing: [] }, ...extra,
});
const at = (path: string) => <MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>;
const BANNED = ["sign in", "sign out", "signing in", "signing out", "create your workspace", "my workspace", "take a look around", "prototype", "sample", "add a course", "upload a syllabus", "add your syllabus", "blank note", "course event"];
// Banned words found on the screen. "Log In" is checked with its capital I; "workspace" is allowed only in "Clear workspace".
const found = (root: Element) => {
  const text = root.textContent ?? "";
  const lower = text.toLowerCase();
  return [...BANNED.filter((w) => lower.includes(w)), ...(text.includes("Log In") ? ["Log In"] : []),
    ...(/workspace/i.test(text.replace(/Clear workspace/g, "")) ? ["workspace"] : [])];
};
const LIST = "sign in/out, signing in/out, Log In, create your workspace, my workspace, workspace, sample, prototype, Add a course, Upload a syllabus, Add your syllabus";
const main = () => document.querySelector("main") ?? document.body;

await test(`1. A banned word is on the landing form or the create form (${LIST})`, "src/features/onboarding.tsx → Onboarding", async () => {
  stubApi({ session: signedOut });
  const root = mount(<MemoryRouter initialEntries={["/"]}><Provider><Onboarding /></Provider></MemoryRouter>);
  await waitFor(() => byLabel("Email address"));
  expect(found(root)).toEqual([]);
  await click(byRole("button", "Create account"));
  await waitFor(() => byLabel("Confirm password"));
  expect(found(root)).toEqual([]);
});
await test(`2. A banned word is on Today or Notes (${LIST})`, "src/features/dashboard.tsx → Dashboard, src/features/notes-list.tsx → Notes", async () => {
  stubApi(routes({ events: { events: [event("e1", today, "09:00")] }, notes: { notes: [note("n1")] } }));
  let root = mount(at("/"));
  await waitFor(() => byRole("heading", "Due"));
  expect(found(root)).toEqual([]);
  root = mount(at("/notes"));
  await waitFor(() => byText(/in your space/));
  expect(found(root)).toEqual([]);
});
await test(`3. A banned word is on Courses or a course page (${LIST})`, "src/features/courses.tsx → Courses, src/features/course-page.tsx → CoursePage", async () => {
  stubApi(routes());
  let root = mount(at("/courses"));
  await waitFor(() => byRole("heading", "Courses"));
  expect(found(root)).toEqual([]);
  root = mount(at("/courses/c1"));
  await waitFor(() => byText("Coming up in this course"));
  expect(found(root)).toEqual([]);
});
await test(`4. A banned word is on Schedule or Friends (${LIST})`, "src/features/schedule.tsx → Schedule, src/features/friends.tsx → Friends", async () => {
  stubApi(routes({ events: { events: [event("e1", today, "09:00")] } }));
  let root = mount(at("/schedule"));
  await waitFor(() => byRole("heading", "Your schedule"));
  expect(found(root)).toEqual([]);
  root = mount(at("/friends"));
  await waitFor(() => byRole("heading", "Friends"));
  expect(found(root)).toEqual([]);
});
await test(`5. A banned word is on Settings, or its Account line still says "sign in" (${LIST})`, "src/features/settings.tsx → Settings, src/features/account.tsx → AccountSettings", async () => {
  stubApi(routes());
  const root = mount(at("/settings"));
  await waitFor(() => byText("Manage how you log in and keep your account secure."));
  expect(found(root)).toEqual([]);
});
await test("6. The Notes page says \"1 notes\" or \"0 note\" (bug 5: 0, 1 and 2 notes)", "src/features/notes-list.tsx → Notes (countOf in src/shared/ui.tsx)", async () => {
  for (const [notes, want] of [[[], "0 notes in your space"], [[note("n1")], "1 note in your space"], [[note("n1"), note("n2")], "2 notes in your space"]] as const) {
    stubApi(routes({ notes: { notes } }));
    mount(at("/notes"));
    await waitFor(() => byText(want));
  }
});
await test("7. Today says \"1 things\" or \"2 thing\" for the due count (bug 5)", "src/features/dashboard.tsx → Dashboard", async () => {
  const seen: string[] = [];
  for (const events of [[event("e1", today, "09:00", "assignment")], [event("e1", today, "09:00", "assignment"), event("e2", today, "", "assignment")]]) {
    stubApi(routes({ events: { events } }));
    const root = mount(at("/"));
    await waitFor(() => byRole("heading", "Due"));
    seen.push(root.querySelector<HTMLElement>("[class*=dayDate] > span:last-child")?.textContent ?? "");
  }
  expect(seen).toEqual(["1 thing due this week", "2 things due this week"]);
});
await test("8. The course page shows \"2026-12-01 · 17:00\" or an empty time (bug 7)", "src/features/course-page.tsx → CoursePage, src/shared/ui.tsx → formatEventWhen", async () => {
  stubApi(routes({ events: { events: [event("e1", "2026-12-01", "17:00", "exam"), event("e2", "2026-12-01", "")] } }));
  const root = mount(at("/courses/c1"));
  await waitFor(() => byText("Event e1"));
  const text = main().textContent!;
  expect([text.includes("December 1 · 5:00 PM"), text.includes("December 1 · All day"), text.includes("2026-12-01"), text.includes("17:00")]).toEqual([true, true, false, false]);
});
await test("9. The window is called \"Add a course\" instead of \"Add course\"", "src/features/course-dialog.tsx → CourseDialog", async () => {
  stubApi(routes({ courses: { courses: [] } }));
  const root = mount(at("/courses"));
  await click(await waitFor(() => byRole("button", "Add course")));
  await waitFor(() => byRole("dialog", "Add course"));
  expect(byRole("dialog", "Add a course")).toBe(null);
});
await test("10. The week strip's today disc keeps the same color in every color scheme", "src/shared/ui.module.css → .weekDay[aria-current] (--ribbon)", async () => {
  stubApi(routes());
  const root = mount(at("/"));
  const chip = () => document.querySelector<HTMLElement>('[aria-current="date"] [data-date]')!;
  await waitFor(() => chip());
  const colors: string[] = [];
  for (const scheme of ["sage", "fjord"]) {
    document.documentElement.dataset.scheme = scheme;
    colors.push(getComputedStyle(chip()).backgroundColor);
  }
  expect(colors[0] !== colors[1]).toBe(true);
});
