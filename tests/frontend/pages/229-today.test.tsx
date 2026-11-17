// Frontend test: the real Today page inside the real app, with the API replaced. Every request must be scripted.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byText, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";
import { dateKey } from "../../../src/services/fixtures";

page({ card: "229", title: "Frontend: Today page on the new design", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const signedIn = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const cse442 = { id: "c1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const note = (id: string, pinned = false) => ({ id, courseId: "c1", title: "Note " + id, body: "Body " + id, lectureDate: "2026-09-01", category: "School", tags: [], pinned, updatedAt: `2026-09-0${id}T12:00:00Z` });
const event = (id: string, date: string, time: string, kind = "assignment") => ({ id, courseId: "c1", title: "Event " + id, kind, date, time, location: "", description: "", source: "manual", seriesId: null });
const today = dateKey();
const PAGE = "src/features/dashboard.tsx → Dashboard";
const routes = (extra: Record<string, unknown> = {}) => ({
  session: signedIn, notes: { notes: [] }, events: { events: [] }, courses: { courses: [cse442] }, "course-notes-shares": { shares: [] },
  "shared-notes": { notes: [] }, friends: { friends: [], incoming: [], outgoing: [] }, ...extra,
});
const at = () => <MemoryRouter initialEntries={["/"]}><Provider><App /></Provider></MemoryRouter>;
const full = routes({ notes: { notes: [note("1"), note("2"), note("3")] }, events: { events: [event("e1", today, "09:00", "class"), event("e2", today, "", "assignment")] } });
const left = (el: Element | null | undefined) => Math.round(el?.getBoundingClientRect().left ?? -1);

await test("1. Today stays on the loading message forever, or shows content before the server answered", PAGE, async () => {
  stubApi({ ...full, events: { status: 200, body: { events: [] }, delay: 300 } });
  const root = mount(at());
  await waitFor(() => byRole("status"));
  expect(byRole("heading", "Your week at a glance") === null).toBe(true);
  await waitFor(() => byRole("heading", "Your week at a glance"));
  expect(root.querySelector("main") !== null).toBe(true);
  expect(byRole("status") === null).toBe(true);
});
await test("2. An account with no notes, events or courses shows a blank area, or has no Add course link to Courses", PAGE, async () => {
  stubApi(routes({ courses: { courses: [] } }));
  const root = mount(at());
  await waitFor(() => byText("No courses yet"));
  for (const want of ["No notes yet", "Nothing due this week.", "Nothing on the calendar", "No exams or projects coming up."]) expect(byText(want) !== null).toBe(true);
  const link = [...root.querySelectorAll<HTMLAnchorElement>("main a")].find((a) => (a.textContent ?? "").trim() === "Add course");
  expect(link?.getAttribute("href")).toBe("/courses");
});
await test("3. A server error leaves a blank page instead of showing the error", PAGE, async () => {
  stubApi({ ...full, events: { status: 500, body: { error: "The server could not load your events." } } });
  const root = mount(at());
  await waitFor(() => (root.textContent ?? "").includes("could not load your events"));
  expect((root.textContent ?? "").trim().length > 0).toBe(true);
});
await test("4. Today's events or the week card are missing, or the count says \"1 events\" or \"2 event\"", PAGE, async () => {
  stubApi(full);
  const root = mount(at());
  const head = (await waitFor(() => byText("TODAY"))).parentElement!;
  expect(head.textContent!.replace("TODAY", "").trim()).toBe("2 events");
  const week = byRole("heading", "Your week at a glance")!.closest("section")!;
  expect((week.textContent ?? "").includes("2 things due this week")).toBe(true);
  expect((week.textContent ?? "").includes("Event e2")).toBe(true);
  expect((root.querySelector("main")?.textContent ?? "").includes("Event e1")).toBe(true);
});
await test("5. A recent note on Today does not link to its note page", PAGE, async () => {
  stubApi(full);
  const root = mount(at());
  await waitFor(() => byRole("heading", "Pick up where you left off"));
  const hrefs = [...root.querySelectorAll<HTMLAnchorElement>("main a")].map((a) => a.getAttribute("href"));
  for (const id of ["1", "2", "3"]) expect(hrefs.includes("/notes/" + id)).toBe(true);
});
await test("6. A card action cannot be reached with the keyboard, or has no visible name", PAGE, async () => {
  stubApi(full);
  const root = mount(at());
  await waitFor(() => byRole("heading", "Pick up where you left off"));
  const actions = [...root.querySelectorAll<HTMLElement>("main button, main a[href]")];
  expect(actions.length > 8).toBe(true);
  const bad = actions.filter((a) => a.tabIndex < 0 || !((a.getAttribute("aria-label") ?? a.textContent ?? "").trim())).map((a) => a.outerHTML.slice(0, 60));
  expect(bad).toEqual([]);
  for (const name of ["Start a note", "Upload a file", "Scan your notes"]) expect(byText(name) !== null).toBe(true);
});
await test("7. The Today page scrolls sideways on a 320 px phone", "src/features/dashboard.module.css", async () => {
  const long = { ...cse442, name: "Software Engineering and Long Names".padEnd(60, "x") };
  stubApi({ ...full, courses: { courses: [long] }, events: { events: [{ ...event("e1", today, "09:00"), title: "x".repeat(120) }, event("e2", "2099-01-05", "10:00", "exam")] } });
  const root = mount(at(), { width: 320 });
  await waitFor(() => byRole("heading", "Pick up where you left off"));
  expect(pageScrollWidth() <= 320).toBe(true);
  expect(root.ownerDocument.querySelector("main")!.scrollWidth <= 320).toBe(true);
});
await test("8. On a 1920 px screen Today is still one narrow column: fewer than three columns, or the content fills under 85% of the page area", "src/features/dashboard.module.css (.grid container queries)", async () => {
  stubApi(full);
  const root = mount(at(), { width: 1920 });
  await waitFor(() => byRole("heading", "Pick up where you left off"));
  const doc = root.ownerDocument;
  doc.body.style.cssText = "margin:0;padding:0;max-width:none"; // the runner page's 60rem reading column is not part of the app
  const week = doc.querySelector('section[aria-labelledby="week-heading"]');
  const picks = [...doc.querySelectorAll("h2")].find((h) => h.textContent === "Pick up where you left off")?.closest("section");
  const aside = doc.querySelector("main aside");
  expect(new Set([left(week), left(picks), left(aside)]).size).toBe(3);
  const content = week!.parentElement!.getBoundingClientRect();
  expect(content.width / doc.querySelector("main")!.getBoundingClientRect().width >= 0.85).toBe(true);
});
