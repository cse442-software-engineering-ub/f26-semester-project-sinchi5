// Frontend test: the real Assignments page inside the real app, with the API replaced. Every request must be scripted.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byLabel, byText, click, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";

page({ card: "231", title: "Frontend: Assignments page on the new design", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const signedIn = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const course = (id: string, code: string) => ({ id, code, name: code + " name", color: "#869D7A", term: "Fall 2026" });
const event = (id: string, courseId: string, date: string, time: string, kind = "assignment") => ({ id, courseId, title: "Event " + id, kind, date, time, location: "", description: "", source: "manual", seriesId: null });
const PAGE = "src/features/assignments.tsx → Assignments";
const routes = (events: unknown[] = []) => ({
  session: signedIn, notes: { notes: [] }, events: { events }, courses: { courses: [course("c1", "CSE 442"), course("c2", "MTH 306")] },
  "course-notes-shares": { shares: [] }, "shared-notes": { notes: [] }, friends: { friends: [], incoming: [], outgoing: [] },
});
const at = () => <MemoryRouter initialEntries={["/assignments"]}><Provider><App /></Provider></MemoryRouter>;
// 2099-01-05 and 2099-01-12 are Mondays, so they fall in the weeks of Jan 4 and Jan 11.
const many = [
  event("e3", "c2", "2099-01-12", "09:00", "exam"), event("e1", "c1", "2099-01-05", "10:00"), event("e2", "c1", "2099-01-05", ""),
  event("e4", "c1", "2099-01-20", "08:00"), event("e5", "c2", "2099-02-02", "08:00", "project"), event("p1", "c1", "2020-01-06", "10:00"),
  event("l1", "c1", "2099-01-06", "10:00", "lecture"),
];
const weeks = ["Week of January 4", "Week of January 11", "Week of January 18", "Week of February 1"];
const rect = (el: Element | null | undefined) => el!.getBoundingClientRect();
const left = (el: Element | null | undefined) => Math.round(rect(el).left);
const row = (title: string) => byText(title)!.closest("button")!;

await test("1. Assignments lists nothing, or leaves out an event the server returned, or shows a lecture or a past item", PAGE, async () => {
  stubApi(routes(many));
  mount(at());
  await waitFor(() => byRole("heading", "Assignments"));
  for (const t of ["Event e1", "Event e2", "Event e3", "Event e4", "Event e5"]) await waitFor(() => byText(t));
  expect(byText("Event l1") === null).toBe(true);
  expect(byText("Event p1") === null).toBe(true);
});
await test("2. Weeks are out of reading order, or an all-day item is not first in its day, or a week heading is wrong", "src/features/assignments.tsx → Assignments (week sections)", async () => {
  stubApi(routes(many));
  mount(at());
  await waitFor(() => byRole("heading", weeks[0]));
  const heads = weeks.map((h) => byRole("heading", h));
  expect(heads.every(Boolean)).toBe(true);
  const order = heads.map((h) => Math.round(rect(h).top / 20) * 100000 + rect(h).left);
  expect(order.every((v, i) => i === 0 || v > order[i - 1])).toBe(true);
  expect(rect(byText("Event e2")).top < rect(byText("Event e1")).top).toBe(true);
  expect(byText("All day") !== null).toBe(true);
});
await test("3. Choosing a course in the Course filter does not narrow the list", PAGE, async () => {
  stubApi(routes(many));
  mount(at());
  const select = await waitFor(() => byLabel("Course")) as unknown as HTMLSelectElement;
  select.value = "c2";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await waitFor(() => byText("Event e1") === null);
  expect(byText("Event e3") !== null && byText("Event e5") !== null).toBe(true);
});
await test("4. Clicking an assignment does not open it", PAGE, async () => {
  stubApi(routes(many));
  mount(at());
  await waitFor(() => byText("Event e1"));
  await click(row("Event e1"));
  await waitFor(() => byRole("dialog"));
});
await test("5. Show past items does not reveal earlier items, or Hide past items does not hide them", PAGE, async () => {
  stubApi(routes(many));
  mount(at());
  await click(await waitFor(() => byRole("button", "Show past items")));
  await waitFor(() => byText("Event p1"));
  expect(byRole("heading", "Earlier this semester") !== null).toBe(true);
  await click(byRole("button", "Hide past items"));
  await waitFor(() => byText("Event p1") === null);
});
await test("6. An account with no upcoming items shows a blank area instead of Nothing due yet", PAGE, async () => {
  stubApi(routes([]));
  mount(at());
  await waitFor(() => byText("Nothing due yet"));
  expect(byText("Add events in your schedule or upload a syllabus.") !== null).toBe(true);
});
await test("7. The Assignments page scrolls sideways on a 320 px phone, or a row is under 44 px tall", "src/features/assignments.module.css", async () => {
  const long = [{ ...event("e1", "c1", "2099-01-05", "10:00"), title: "x".repeat(120) }, event("e2", "c1", "2099-01-06", "11:00", "exam")];
  stubApi(routes(long));
  const root = mount(at(), { width: 320 });
  await waitFor(() => byText("Event e2"));
  expect(pageScrollWidth() <= 320).toBe(true);
  expect(root.ownerDocument.querySelector("main")!.scrollWidth <= 320).toBe(true);
  expect(rect(row("Event e2")).height >= 44).toBe(true);
});
await test("8. At 1920 px the weeks are one narrow column, or at 375 px they sit side by side", "src/features/assignments.module.css (.weeks grid)", async () => {
  stubApi(routes(many));
  let root = mount(at(), { width: 1920 });
  await waitFor(() => byText("Event e5"));
  let doc = root.ownerDocument;
  doc.body.style.cssText = "margin:0;padding:0;max-width:none"; // the runner page's reading column is not part of the app
  expect(new Set(weeks.slice(0, 3).map((h) => left(byRole("heading", h)))).size).toBe(3);
  const grid = byRole("heading", weeks[0])!.closest("section")!.parentElement!;
  expect(rect(grid).width / rect(doc.querySelector("main")).width >= 0.85).toBe(true);
  expect(pageScrollWidth() <= 1920).toBe(true);
  stubApi(routes(many));
  root = mount(at(), { width: 375 });
  await waitFor(() => byText("Event e5"));
  expect(new Set(weeks.map((h) => left(byRole("heading", h)))).size).toBe(1);
});
