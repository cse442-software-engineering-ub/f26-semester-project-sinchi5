// Frontend test: the finish-review fixes on the real screens (shared heading, Today and Schedule rails, grids, landing), API replaced.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, waitFor } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";
import { dateKey } from "../../../src/services/fixtures";

page({ card: "259", title: "Frontend: Planner polish across every page", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const signedIn = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const course = (id: string, code: string, name: string) => ({ id, code, name, color: "#869D7A", term: "Fall 2026" });
const courses = [course("c1", "CSE 442", "Software Engineering"), course("c2", "CSE 250", "Data Structures"), course("c3", "MTH 306", "Differential Equations"), course("c4", "PHY 107", "College Physics I")];
const today = dateKey();
const event = (id: string, courseId: string, title: string, kind: string, time: string) => ({ id, courseId, title, kind, date: today, time, location: "", description: "", source: "manual", seriesId: null });
const note = (id: string, courseId: string) => ({ id, ownerId: "1", courseId, title: "Note " + id, body: "Body " + id, lectureDate: "2026-09-01", category: "School", tags: [], pinned: false, visibility: "private", createdAt: "2026-09-01T12:00:00Z", updatedAt: `2026-09-0${id}T12:00:00Z` });
const events = [event("e1", "c1", "CSE 442 Lecture", "lecture", "09:00"), event("e2", "c2", "Homework 6", "assignment", "23:59")];
const routes = { session: signedIn, notes: { notes: [note("1", "c1"), note("2", "c1")] }, events: { events }, courses: { courses }, "course-notes-shares": { shares: [] }, "shared-notes": { notes: [] }, friends: { friends: [], incoming: [], outgoing: [] }, "schedule-shares": { shares: [] } };
const at = (path: string) => <MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>;
const view = (root: HTMLElement, height: number) => { (root.ownerDocument.defaultView!.frameElement as HTMLElement).style.height = `${height}px`; return root.ownerDocument; };
const hourLabels = (root: HTMLElement) => [...root.querySelectorAll("span, div")].filter((e) => e.children.length === 0 && /^\d{1,2} [AP]M$/.test(e.textContent ?? "")).map((e) => e.textContent);

await test("1. At 375 the page title breaks letter by letter or the primary action shrinks to a bare plus", "src/shared/ui.module.css → .pageHeading (max-width 767px)", async () => {
  stubApi(routes);
  for (const [path, title, action] of [["/courses", "Courses", "Add course"], ["/schedule", "Your schedule", "Add event"]]) {
    const root = mount(at(path), { width: 375 });
    const h1 = await waitFor(() => byRole("heading", title));
    const lines = h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight);
    expect(lines < 1.6).toBe(true);
    const button = [...root.querySelectorAll<HTMLElement>("main button")].find((b) => (b.textContent ?? "").trim() === action)!;
    expect(button !== undefined && parseFloat(getComputedStyle(button).fontSize) > 10 && button.getBoundingClientRect().width > 60).toBe(true);
    expect(button.getBoundingClientRect().top > h1.getBoundingClientRect().bottom - 1).toBe(true);
  }
});
await test("2. A 23:59 due item stretches the hour rail to midnight or is missing from the due strip", "src/features/dashboard.tsx → Dashboard (fits), src/features/schedule.tsx → Schedule (toHour)", async () => {
  stubApi(routes);
  const root = mount(at("/"), { width: 1440 });
  await waitFor(() => root.querySelector("[data-rail]"));
  expect(hourLabels(root).includes("11 PM")).toBe(false);
  const strip = root.querySelector("[aria-label='All day and due']")!;
  expect((strip.textContent ?? "").includes("Due 11:59 PM")).toBe(true);
  expect(root.querySelectorAll("[data-block]").length).toBe(1);
  stubApi(routes);
  const week = mount(at("/schedule"), { width: 1440 });
  await waitFor(() => byRole("heading", "Your schedule"));
  await waitFor(() => week.querySelector("[data-day]"));
  expect(hourLabels(week).includes("11 PM")).toBe(false);
  expect((week.textContent ?? "").includes("Due 11:59 PM")).toBe(true);
});
await test("3. At 1440 x 900 the 8 AM to 6 PM rail, the Now ribbon or the facing page need scrolling to reach", "src/features/dashboard.module.css → .dayPage (--hour)", async () => {
  stubApi(routes);
  const root = mount(at("/"), { width: 1440 });
  const doc = view(root, 900);
  const ribbon = await waitFor(() => root.querySelector("[data-ribbon]"));
  const rail = root.querySelector("[data-rail]")!.getBoundingClientRect();
  expect(hourLabels(root).includes("8 AM") && hourLabels(root).includes("5 PM")).toBe(true);
  expect(Math.round(rail.bottom) <= 900).toBe(true);
  expect(Math.round(ribbon.getBoundingClientRect().bottom) <= 900).toBe(true);
  const facing = byRole("heading", "Notes for today")!.getBoundingClientRect();
  expect(facing.top > 0 && facing.bottom < 900).toBe(true);
  expect(doc.defaultView!.innerHeight).toBe(900);
});
await test("4. Notes or Courses at 1440 leave an orphan card or half the sheet empty", "src/features/courses.module.css → .grid, src/features/notes-list.module.css → .group .grid", async () => {
  stubApi(routes);
  const check = (root: HTMLElement) => {
    const found = [...root.querySelectorAll<HTMLElement>("main ul, main ol, main div")].filter((e) => !e.closest("header") && e.children.length >= 2 && getComputedStyle(e).display === "grid" && e.querySelector(":scope > * a, :scope > a, :scope > article"));
    expect(found.length > 0).toBe(true);
    for (const g of found) {
      const columns = getComputedStyle(g).gridTemplateColumns.split(" ").length;
      const kids = [...g.children].map((c) => c.getBoundingClientRect());
      const last = Math.max(...kids.map((k) => k.top));
      const fill = (Math.max(...kids.filter((k) => k.top === last).map((k) => k.right)) - g.getBoundingClientRect().left) / g.getBoundingClientRect().width;
      expect(columns <= 2 || fill >= 0.9).toBe(true);
    }
  };
  const c = mount(at("/courses"), { width: 1440 });
  await waitFor(() => byRole("heading", "Courses"));
  await waitFor(() => c.querySelector("main li a"));
  check(c);
  const n = mount(at("/notes"), { width: 1440 });
  await waitFor(() => byRole("heading", "Notes"));
  await waitFor(() => n.querySelector("main article, main li a"));
  check(n);
});
await test("5. The landing page still shows an uppercase eyebrow or the star glyph", "src/features/onboarding.module.css → .dayTag, .dayLabel, src/features/onboarding.tsx → LinkLogo", async () => {
  stubApi({ session: { user: null, onboarding: { completed: false, step: 0 }, csrfToken: "test-token" } });
  const root = mount(at("/"), { width: 1440 });
  await waitFor(() => byRole("button", "Log in"));
  const shouty = [...root.querySelectorAll<HTMLElement>("*")].filter((e) => (e.textContent ?? "").trim() && getComputedStyle(e).textTransform === "uppercase").map((e) => e.textContent);
  expect(shouty).toEqual([]);
  expect((root.textContent ?? "").includes("✦")).toBe(false);
  expect(byRole("heading", "Example day") !== null && byRole("heading", "Notes for today") !== null).toBe(true);
});
