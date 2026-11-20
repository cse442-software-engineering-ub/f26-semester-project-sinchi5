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
import { buildPalette } from "../../../src/services/palette";

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
const full = routes({ notes: { notes: [note("1"), note("2"), note("3")] }, events: { events: [event("e1", today, "09:00", "lecture"), event("e2", today, "", "assignment")] } });
const left = (el: Element | null | undefined) => Math.round(el?.getBoundingClientRect().left ?? -1);

await test("1. Today stays on the loading message forever, or shows content before the server answered", PAGE, async () => {
  stubApi({ ...full, events: { status: 200, body: { events: [] }, delay: 300 } });
  const root = mount(at());
  await waitFor(() => byRole("status"));
  expect(byRole("heading", "Pick up where you left off") === null).toBe(true);
  await waitFor(() => byRole("heading", "Pick up where you left off"));
  expect(root.querySelector("main") !== null).toBe(true);
  expect(byRole("status") === null).toBe(true);
});
await test("2. An account with no notes, events or courses shows a blank area, or has no Add course link to Courses", PAGE, async () => {
  stubApi(routes({ courses: { courses: [] } }));
  const root = mount(at());
  await waitFor(() => byText(/No courses yet/));
  for (const want of ["No notes yet", "Nothing due this week.", "Nothing scheduled today"]) expect(byText(want) !== null).toBe(true);
  const link = [...root.querySelectorAll<HTMLAnchorElement>("main a")].find((a) => (a.textContent ?? "").trim() === "Add course");
  expect(link?.getAttribute("href")).toBe("/courses");
});
await test("3. A server error leaves a blank page instead of showing the error", PAGE, async () => {
  stubApi({ ...full, events: { status: 500, body: { error: "The server could not load your events." } } });
  const root = mount(at());
  await waitFor(() => (root.textContent ?? "").includes("could not load your events"));
  expect((root.textContent ?? "").trim().length > 0).toBe(true);
});
await test("4. Today's events or the due list are missing, or the due count is wrong", PAGE, async () => {
  stubApi(full);
  const root = mount(at());
  await waitFor(() => byRole("heading", "Due"));
  const main = root.querySelector("main")!;
  expect((main.textContent ?? "").includes("1 thing due this week")).toBe(true);
  expect(main.querySelector("[data-block]")?.textContent?.includes("Event e1")).toBe(true);
  expect((byRole("heading", "Due")!.closest("section")!.textContent ?? "").includes("Event e2")).toBe(true);
  expect((byRole("heading", "Due")!.closest("section")!.textContent ?? "").includes("Due tonight")).toBe(true);
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
await test("8. On a 1920 px screen the two pages do not sit side by side filling the page area", "src/features/dashboard.module.css (.spread, Spread)", async () => {
  stubApi(full);
  const root = mount(at(), { width: 1920 });
  await waitFor(() => byRole("heading", "Pick up where you left off"));
  const doc = root.ownerDocument;
  doc.body.style.cssText = "margin:0;padding:0;max-width:none"; // the runner page's 60rem reading column is not part of the app
  const [a, b] = [...doc.querySelectorAll("[data-page]")];
  expect(left(b) > left(a) + 400).toBe(true);
  const sheet = a.closest("section")!.getBoundingClientRect();
  expect(sheet.width / doc.querySelector("main")!.getBoundingClientRect().width >= 0.85).toBe(true);
});
await test("9. The left page lacks the day name, the hour rail or the Now ribbon, or the ribbon label is not the clock", "src/features/dashboard.tsx → Dashboard (rail, ribbon)", async () => {
  stubApi(full);
  const root = mount(at());
  await waitFor(() => root.querySelector("[data-ribbon]"));
  const name = new Date().toLocaleDateString("en-US", { weekday: "long" });
  expect(byRole("heading", name) !== null).toBe(true);
  expect(root.querySelectorAll("[data-rail] > div > div").length > 9).toBe(true);
  expect(/^Now · \d{1,2}:\d{2}$/.test(root.querySelector("[data-ribbon]")!.textContent ?? "")).toBe(true);
  expect(root.querySelectorAll("[data-day]").length).toBe(7);
});
await test("10. A class with no note offers no Start a note button, or one with a note does not open it", "src/features/dashboard.tsx → Dashboard (notes for today)", async () => {
  const withNote = routes({ notes: { notes: [{ ...note("1"), lectureDate: today }] }, events: full.events });
  stubApi(withNote);
  const root = mount(at());
  await waitFor(() => byRole("heading", "Notes for today"));
  const open = [...root.querySelectorAll<HTMLAnchorElement>("main a")].find((a) => a.getAttribute("aria-label") === "Open note for CSE 442");
  expect(open?.getAttribute("href")).toBe("/notes/1");
  stubApi(full);
  mount(at());
  await waitFor(() => document.querySelector('button[aria-label="Start a note for CSE 442"]'));
});
await test("11. On a 375 px phone the pages stay side by side, or the page scrolls sideways", "src/features/dashboard.module.css (@container)", async () => {
  stubApi(full);
  const root = mount(at(), { width: 375 });
  await waitFor(() => byRole("heading", "Pick up where you left off"));
  const [a, b] = [...root.ownerDocument.querySelectorAll("[data-page]")];
  expect(b.getBoundingClientRect().top >= a.getBoundingClientRect().bottom - 1).toBe(true);
  expect(pageScrollWidth() <= 375).toBe(true);
});
await test("12. Text on the spread is under 4.5:1 in a dark scheme or a custom theme", "src/features/dashboard.module.css (colors only through variables)", async () => {
  const lum = (c: string) => { const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  stubApi(full);
  const root = mount(at());
  await waitFor(() => root.querySelector("[data-ribbon]"));
  const html = document.documentElement;
  const custom = buildPalette({ accent: "#7a3b8c", background: "#f6f0fa", text: "#2b1d35" }).dark;
  const modes: [string, () => void][] = [
    ["dark fjord", () => { html.dataset.scheme = "fjord"; html.dataset.theme = "dark"; }],
    ["custom", () => { for (const [k, v] of Object.entries(custom)) html.style.setProperty(k, v); }],
  ];
  const bad: string[] = [];
  for (const [name, apply] of modes) {
    apply();
    const page = root.querySelector("[data-page]")!;
    for (const el of [root.querySelector("h2")!, root.querySelector("[data-ribbon] span")!]) {
      const back = el.closest("[data-ribbon]") ? getComputedStyle(el).backgroundColor : getComputedStyle(page.parentElement!.parentElement!).backgroundColor;
      if (ratio(getComputedStyle(el).color, back) < 4.5) bad.push(`${name}: ${el.textContent}`);
    }
  }
  html.removeAttribute("style");
  expect(bad).toEqual([]);
});
await test("13. The next exam past this week is missing from Today or lacks its date and \"in N days\"", "src/features/dashboard.tsx → Dashboard (later)", async () => {
  const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + 10);
  stubApi(routes({ events: { events: [event("x1", dateKey(d), "10:00", "exam")] } }));
  const root = mount(at());
  await waitFor(() => byRole("heading", "Due"));
  const text = byRole("heading", "Due")!.closest("section")!.textContent ?? "";
  expect([text.includes("Event x1"), text.includes("In 10 days")]).toEqual([true, true]);
});
