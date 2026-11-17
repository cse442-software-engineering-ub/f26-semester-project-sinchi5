// Frontend test: the real Schedule screen with the real Provider; the API is replaced.
import "@fontsource-variable/inter";
import "../../../src/app/global.css";
import "../../../src/shared/ui.module.css"; // loaded before the screen's own styles, as main.tsx does
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
const ui = (url = "/schedule?date=2026-11-24") => <MemoryRouter initialEntries={[url]}><Provider><Schedule /></Provider></MemoryRouter>;
const sent = (api: { sent: { route: string }[] }, route: string) => api.sent.filter((r) => r.route === route) as { route: string; body: any }[];
const dayButton = (label: RegExp) => byRole("button", label);
const rect = (el: Element | null | undefined) => el!.getBoundingClientRect();

await test("1. The calendar or the day list ignores the events the server sent", SCREEN + ", src/shared/ui.tsx → EventRow", async () => {
  server();
  mount(ui());
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
await test("4. Selecting a day shows another day's events, or none", SCREEN + " → day buttons, set('date')", async () => {
  server();
  mount(ui());
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
const phone = (width: number) => {
  mount(ui(), { width });
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
await test("8. At 1920 px the calendar and the day panel stack, or leave the width unused", CSS, async () => {
  server();
  phone(1920);
  await waitFor(() => byText("Design review"));
  const cal = dayButton(/Tue Nov 24 2026/)!.closest("section");
  const day = byText("Your day at a glance")!.closest("section");
  expect(rect(day).left >= rect(cal).right - 1).toBe(true);
  expect(Math.abs(rect(day).top - rect(cal).top) < 40).toBe(true);
  expect((rect(cal).width + rect(day).width) / 1920 >= 0.85).toBe(true);
});
