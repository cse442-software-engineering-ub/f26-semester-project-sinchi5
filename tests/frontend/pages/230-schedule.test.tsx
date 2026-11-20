// Frontend test: the real Schedule screen with the real Provider; the API is replaced.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles"; // every screen stylesheet, shared first as main.tsx does
import { buildPalette, contrastRatio, PALETTE_VARIABLES } from "../../../src/services/palette";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byText, byLabel, click, type, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import { Schedule } from "../../../src/features/schedule";

page({ card: "230", title: "Frontend: Schedule and event windows on the new design", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const session = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const cse442 = { id: "c-1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const lecture = { id: "21", courseId: "c-1", title: "Design review", kind: "lecture", date: "2026-11-24", time: "10:00", location: "Knox 20",
  description: "", source: "manual", importJobId: null, seriesId: null };
const exam = { id: "22", courseId: "c-1", title: "Final exam", kind: "exam", date: "2026-11-25", time: "15:00", location: "",
  description: "", source: "imported", importJobId: "9", seriesId: null };
const SCREEN = "src/features/schedule.tsx → Schedule";
const CSS = "src/features/schedule.module.css → .scheduleLayout, .calendarPanel, .day";

const server = (extra: Record<string, unknown> = {}, events: unknown[] = [lecture, exam], courses: unknown[] = [cse442]) => stubApi({
  session, notes: { notes: [] }, courses: { courses }, events: { events },
  "event-save": (req: { body: Record<string, unknown> }) => ({ status: 201, body: { event: { id: "99", source: "manual", ...req.body } } }),
  ...extra,
});
const MONTH = "/schedule?date=2026-11-24&view=month";
const ui = (url = "/schedule?date=2026-11-24") => <MemoryRouter initialEntries={[url]}><Provider><Schedule /></Provider></MemoryRouter>;
const sent = (api: { sent: { route: string }[] }, route: string) => api.sent.filter((r) => r.route === route) as { route: string; body: any }[];
const dayButton = (label: RegExp) => byRole("button", label);
const rect = (el: Element | null | undefined) => el!.getBoundingClientRect();

await test("1. The month or the day list ignores the events the server sent", SCREEN + ", src/shared/ui.tsx → EventRow", async () => {
  server();
  mount(ui(MONTH));
  await waitFor(() => dayButton(/Tue Nov 24 2026, 1 event$/));
  expect(dayButton(/Wed Nov 25 2026, 1 event$/) !== null).toBe(true);
  expect(dayButton(/Thu Nov 26 2026, 0 events$/) !== null).toBe(true);
  expect(byText("Design review") !== null).toBe(true);
});
await test("2. An empty schedule leaves the student stuck: no empty state or no link to Courses", SCREEN + " → Empty", async () => {
  server({}, [], []);
  mount(ui());
  await waitFor(() => byText("A little breathing room"));
  const link = await waitFor(() => byRole("link", "Go to Courses"));
  expect(link.getAttribute("href")).toBe("/courses");
});
await test("3. A server error on save is hidden, or the window is thrown away", SCREEN + " → EventDialog onSubmit", async () => {
  server({ "event-save": { status: 422, body: { error: "Choose a course for this event." } } });
  mount(ui());
  await click(await waitFor(() => byRole("button", "Add event")));
  await type(await waitFor(() => byLabel("Title")), "Office hours");
  await click(byRole("button", "Create event"));
  await waitFor(() => byText("Choose a course for this event."));
  expect(byLabel("Title")?.value).toBe("Office hours");
});
await test("4. Selecting a day in the month shows another day's events, or none", SCREEN + " → day buttons, set('date')", async () => {
  server();
  mount(ui(MONTH));
  await waitFor(() => byText("Design review"));
  await click(dayButton(/Wed Nov 25 2026/));
  await waitFor(() => byText("Final exam"));
  expect(byText("Design review") === null).toBe(true);
  expect(dayButton(/Wed Nov 25 2026/)!.getAttribute("aria-pressed")).toBe("true");
});
await test("5. The new-event window sends no event-save, more than one, other fields, or stays open", SCREEN + " → EventDialog", async () => {
  const api = server();
  mount(ui());
  await waitFor(() => byText("Design review"));
  await click(byRole("button", "Add event"));
  await type(await waitFor(() => byLabel("Title")), "Office hours");
  await type(byLabel("Time"), "13:30");
  await click(byRole("button", "Create event"));
  await waitFor(() => sent(api, "event-save").length > 0);
  await waitFor(() => byRole("dialog") === null);
  expect(sent(api, "event-save").length).toBe(1);
  const b = sent(api, "event-save")[0].body;
  expect([b.title, b.courseId, b.date, b.time]).toEqual(["Office hours", "c-1", "2026-11-24", "13:30"]);
});
await test("6. The details window doesn't open from an event, Escape doesn't close it, or focus is lost", "src/shared/ui.tsx → Modal (finalFocus), " + SCREEN + " → openEvent", async () => {
  server();
  mount(ui());
  const row = await waitFor(() => byRole("button", /^10:00 AM/));
  row.focus();
  await click(row);
  await waitFor(() => byRole("dialog"));
  expect(byText("Event details") !== null).toBe(true);
  expect(byLabel("Title")?.value).toBe("Design review");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await waitFor(() => byRole("dialog") === null);
  await waitFor(() => document.activeElement === row);
});
// The harness iframe inherits the runner page's 60rem body; the real app has no such cap.
const phone = (width: number, url?: string) => {
  mount(ui(url), { width });
  const body = [...document.querySelectorAll("iframe")].pop()!.contentDocument!.body;
  body.style.maxWidth = "none"; body.style.padding = "0";
};
await test("7. Something sticks out sideways at 320 px, with the window closed or open", CSS + ", src/shared/ui.module.css → .modal", async () => {
  server({}, [{ ...lecture, title: "A very long event title that must not push the page wider than the phone", repeat: { every: 1, days: [2], until: "2026-12-22" } }, exam]);
  phone(320);
  const row = await waitFor(() => byRole("button", /^10:00 AM/));
  expect(pageScrollWidth() <= 320).toBe(true);
  await click(row);
  // The window opens on the test page itself (portal), so its own fields are measured there.
  const dialog = await waitFor(() => document.querySelector<HTMLElement>("[role=dialog]"));
  expect(pageScrollWidth() <= 320).toBe(true);
  expect(dialog.scrollWidth <= dialog.clientWidth).toBe(true);
});
const frameDoc = () => [...document.querySelectorAll("iframe")].pop()!.contentDocument!;
const colsOf = () => [...frameDoc().querySelectorAll<HTMLElement>("[role=group][data-day]")];
const hex = (c: string) => "#" + (c.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
await test("8. At 1920 px the month page and the day page stack, or leave the width unused", CSS, async () => {
  server();
  phone(1920, MONTH);
  await waitFor(() => byText("Design review"));
  const cal = dayButton(/Tue Nov 24 2026/)!.closest("[data-page]");
  const day = byText("Your day at a glance")!.closest("[data-page]");
  expect(rect(day).left >= rect(cal).right - 1).toBe(true);
  expect(Math.abs(rect(day).top - rect(cal).top) < 40).toBe(true);
  expect((rect(cal).width + rect(day).width) / 1920 >= 0.85).toBe(true);
});
await test("9. The week is not a planner: no Week | Month control, not seven columns on one hour rail, no block placed by its time, or no all-day strip", SCREEN + " → Schedule (week), .planner, .block", async () => {
  server({}, [lecture, exam, { ...lecture, id: "23", title: "Project due", kind: "deadline", time: "" }]);
  phone(1440);
  const block = await waitFor(() => byRole("button", /^10:00 AM Design review/));
  expect(byRole("button", "Week")!.getAttribute("aria-pressed")).toBe("true");
  expect(byRole("button", "Month") !== null).toBe(true);
  const cols = colsOf();
  expect(cols.length).toBe(7);
  expect(new Set(cols.map((c) => Math.round(rect(c).top))).size).toBe(1);
  const tuesday = block.closest("[data-day]")!;
  const wednesday = byRole("button", /^3:00 PM Final exam/)!.closest("[data-day]")!;
  const fiveHours = rect(byRole("button", /^3:00 PM Final exam/)).top - rect(wednesday).top - (rect(block).top - rect(tuesday).top);
  expect(Math.round(fiveHours) >= 5 * 50).toBe(true); // 10 AM and 3 PM sit five hours apart on the rail
  expect(rect(byRole("button", /Project due/)).bottom <= rect(tuesday).top + 1).toBe(true); // the all-day strip sits above the rail
  expect(byText("10 AM") !== null && byText("3 PM") !== null).toBe(true);
});
await test("10. Week | Month does not switch views, or the week arrows do not move a week", SCREEN + " → set('view'), WeekStrip onPrev / onNext", async () => {
  server();
  mount(ui());
  await waitFor(() => byRole("button", /^10:00 AM Design review/));
  await click(byRole("button", "Month"));
  await waitFor(() => dayButton(/Tue Nov 24 2026/));
  expect(byText("Your day at a glance") !== null).toBe(true);
  await click(byRole("button", "Week"));
  await click(await waitFor(() => byRole("button", "Next week")));
  await waitFor(() => byRole("button", /^10:00 AM Design review/) === null);
  await click(byRole("button", "Previous week"));
  await waitFor(() => byRole("button", /^10:00 AM Design review/));
});
await test("11. At 375 px the week is not one day at a time on the rail, it scrolls sideways, or a day in the strip does not move to that day", CSS + " (@container week)", async () => {
  server();
  phone(375);
  await waitFor(() => byRole("button", /^10:00 AM Design review/));
  expect(colsOf().filter((c) => c.offsetParent !== null).length).toBe(1);
  expect(pageScrollWidth() <= 375).toBe(true);
  await click(frameDoc().querySelector<HTMLElement>("button[data-day='2026-11-25']"));
  await waitFor(() => byRole("button", /^3:00 PM Final exam/)!.offsetParent !== null);
  expect(byRole("button", /^10:00 AM Design review/)!.offsetParent === null).toBe(true);
});
await test("12. At 1920 px the seven columns leave the width unused, or at 1440 a column is under 140 px", CSS + " (.row grid)", async () => {
  server();
  phone(1920);
  await waitFor(() => byRole("button", /^10:00 AM Design review/));
  let cols = colsOf();
  const sheet = cols[0].closest("section")!;
  expect(rect(cols[6]).right >= rect(sheet).right - 80).toBe(true);
  expect(cols.every((c) => rect(c).width >= 180)).toBe(true);
  phone(1440);
  await waitFor(() => byRole("button", /^10:00 AM Design review/));
  cols = colsOf();
  expect(cols.every((c) => rect(c).width >= 140)).toBe(true);
});
await test("13. Event text is under 4.5:1 on the sheet in a dark scheme or in a custom theme", "src/app/tokens.css, src/features/schedule.module.css (.block, .pill)", async () => {
  server();
  const root = document.documentElement;
  const read = () => {
    const sheet = document.querySelector<HTMLElement>("section[aria-label=Week]")!;
    return contrastRatio(hex(getComputedStyle(byText("Design review")!).color), hex(getComputedStyle(sheet).backgroundColor));
  };
  try {
    root.dataset.scheme = "fjord"; root.dataset.theme = "dark";
    mount(ui());
    await waitFor(() => byText("Design review"));
    expect(read() >= 4.5).toBe(true);
    const custom = buildPalette({ accent: "#c2410c", background: "#fff8ec", text: "#3b2f2f" }).light;
    for (const n of PALETTE_VARIABLES) root.style.setProperty(n, custom[n]);
    root.dataset.theme = "light";
    expect(read() >= 4.5).toBe(true);
  } finally {
    delete root.dataset.scheme; delete root.dataset.theme;
    for (const n of PALETTE_VARIABLES) root.style.removeProperty(n);
  }
});
