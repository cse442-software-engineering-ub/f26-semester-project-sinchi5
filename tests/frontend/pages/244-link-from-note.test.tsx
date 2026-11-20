// Frontend test: link a note to a class meeting from the note's Details and from the notes list, API replaced.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import "../../../src/features/rich-editor"; // loads the editor chunk and its stylesheet now
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, click, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";

page({ card: "244", title: "Frontend: Link a note to a class from the note and the notes list", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const courses = [
  { id: "c1", code: "CSE 442", name: "Software Engineering", color: "#8b5d33", term: "Fall 2026" },
  { id: "c2", code: "CSE 250", name: "Data Structures", color: "#7d9a76", term: "Fall 2026" },
];
const ev = (id: string, courseId: string, title: string, date: string, extra: Record<string, unknown> = {}) =>
  ({ id, courseId, title, kind: "lecture", date, time: "09:30", location: "", description: "", source: "manual", ...extra });
// Lecture meets Tuesdays and Thursdays; Lab is one meeting; a classmate's event must not be offered.
const events = [
  ev("e1", "c1", "Lecture", "2026-11-03", { repeat: { every: 1, days: [2, 4], until: "2026-12-01" } }),
  ev("e2", "c1", "Lab", "2026-11-12", { time: "14:00" }),
  ev("e3", "c2", "Recitation", "2026-11-11"),
  ev("e4", "c1", "Friend's lecture", "2026-11-10", { sharedBy: { id: "9", name: "Grace Hopper" } }),
];
const note = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, ownerId: "1", courseId: "c1", title, body: `<p>Body of ${title}</p>`, format: "html", excerpt: `Body of ${title}`, lectureDate: "2026-11-10", category: "School",
  tags: [], pinned: false, visibility: "private", createdAt: "2026-11-10T12:00:00Z", updatedAt: "2026-11-12T12:00:00Z", remindAt: null, eventId: null, eventDate: null, ...extra,
});
const linked = note("n1", "Scrum roles", { eventId: "e1", eventDate: "2026-11-17" });
const unlinked = note("n1", "Scrum roles");
const routes = (n: unknown, extra: Record<string, unknown> = {}, list: unknown[] = [n]) => ({
  session: { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "t" }, notes: { notes: list }, events: { events }, courses: { courses },
  "course-notes-shares": { shares: [] }, "shared-notes": { notes: [] }, friends: { friends: [], incoming: [], outgoing: [] }, note: { note: n },
  "note-versions": { versions: [] }, "note-collaborators": { collaborators: [] }, "note-comments": { comments: [] }, ...extra,
});
const at = (path: string, width?: number) => mount(<MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>, { width });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const openDetails = async (r: Record<string, unknown>, width?: number) => {
  const api = stubApi(r);
  const root = at("/notes/n1", width);
  await waitFor(() => root.querySelector(".ProseMirror") && byRole("button", "Details"));
  await click(byRole("button", "Details"));
  return { api, root };
};
const openList = async (r: Record<string, unknown>) => {
  const api = stubApi(r);
  const root = at("/notes");
  await waitFor(() => root.querySelectorAll("main h3").length >= 1);
  return { api, root };
};
const row = () => document.querySelector("[class*=linkedEvent]");
const chip = () => document.querySelector("a[href*='/schedule?date=']") as HTMLAnchorElement | null;

const EDITOR = "src/features/link-event.tsx → LinkControls, note-editor.tsx → Linked event row";
const LIST = "src/features/notes-list.tsx → LinkControls in each card's cell";

await test("1. Details does not show the linked class and day as a chip that opens the Schedule at that day", EDITOR, async () => {
  await openDetails(routes(linked));
  await waitFor(() => chip());
  expect(chip()!.textContent!.trim()).toBe("Lecture · Tue Nov 17");
  expect(chip()!.getAttribute("href")).toBe("/schedule?date=2026-11-17");
  expect(!!byRole("button", "Unlink") && !!byRole("button", "Change class")).toBe(true);
});
await test("2. The picker does not list only the student's own events of the note's course, one entry per meeting date, nearest the note's day first", EDITOR, async () => {
  await openDetails(routes(unlinked));
  await click(byRole("button", "Link to a class…"));
  const dialog = await waitFor(() => byRole("dialog"));
  const heads = [...dialog.querySelectorAll("h3")].map((h) => h.textContent);
  expect(heads.slice(0, 3)).toEqual(["Tue Nov 10", "Thu Nov 12", "Thu Nov 5"]);
  expect(heads.includes("Tue Nov 17") && heads.includes("Thu Nov 26")).toBe(true);
  expect(dialog.querySelector("section[aria-label='Thu Nov 12']")!.textContent!.includes("Lab") && dialog.textContent!.includes("Lecture")).toBe(true);
  expect(dialog.textContent!.includes("Friend's lecture") || dialog.textContent!.includes("Recitation")).toBe(false);
  await click(byRole("checkbox", "Show every course"));
  expect(dialog.textContent!.includes("Recitation")).toBe(true);
});
await test("3. Picking a meeting does not post note-link with that date, or leave the chip, course and lecture date unchanged", EDITOR, async () => {
  const saved = note("n1", "Scrum roles", { eventId: "e1", eventDate: "2026-11-17", lectureDate: "2026-11-17" });
  const { api } = await openDetails(routes(unlinked, { "note-link": { note: saved } }));
  await click(byRole("button", "Link to a class…"));
  const dialog = await waitFor(() => byRole("dialog"));
  await click(dialog.querySelector("section[aria-label='Tue Nov 17'] button") as HTMLElement);
  await waitFor(() => chip());
  const sent = api.sent.find((s) => s.route === "note-link")!;
  expect(sent.body).toEqual({ noteId: "n1", eventId: "e1", date: "2026-11-17" });
  expect(chip()!.textContent!.trim()).toBe("Lecture · Tue Nov 17");
  expect((byRole("textbox", "Lecture date") ?? document.querySelector("input[type=date]") as HTMLInputElement).value).toBe("2026-11-17");
  expect(byRole("dialog")).toBe(null);
});
await test("4. Unlink does not post note-link with eventId null and remove the chip", EDITOR, async () => {
  const { api } = await openDetails(routes(linked, { "note-link": { note: { ...linked, eventId: null, eventDate: null } } }));
  await click(byRole("button", "Unlink"));
  await waitFor(() => !chip());
  expect(api.sent.find((s) => s.route === "note-link")!.body).toEqual({ noteId: "n1", eventId: null, date: "2026-11-17" });
  expect(!!byRole("button", "Link to a class…")).toBe(true);
});
await test("5. A notes-list card does not show the chip, or Link to a class… and Unlink do not post note-link", LIST, async () => {
  let after = false; // the list the server returns once the note is unlinked
  const { api } = await openList(routes(linked, { "note-link": () => { after = true; return { note: { ...linked, eventId: null, eventDate: null } }; }, notes: () => ({ notes: [after ? { ...linked, eventId: null, eventDate: null } : linked] }) }));
  expect(chip()!.textContent!.trim()).toBe("Lecture · Tue Nov 17");
  await click(byRole("button", "Unlink"));
  await waitFor(() => !chip());
  expect(api.sent.find((s) => s.route === "note-link")!.body.eventId).toBe(null);
  const again = { ...linked, eventDate: "2026-11-12" };
  let done = false;
  const { api: api2 } = await openList(routes(unlinked, { "note-link": () => { done = true; return { note: again }; }, notes: () => ({ notes: [done ? again : unlinked] }) }));
  await click(byRole("button", "Link to a class…"));
  const dialog = await waitFor(() => byRole("dialog"));
  await click(dialog.querySelector("section[aria-label='Thu Nov 12'] button") as HTMLElement);
  await waitFor(() => chip());
  expect(api2.sent.find((s) => s.route === "note-link")!.body).toEqual({ noteId: "n1", eventId: "e1", date: "2026-11-12" });
});
await test("6. A viewer does not see the chip without any Link, Change or Unlink control", EDITOR, async () => {
  const theirs = { ...linked, ownerId: "9" };
  const people = { collaborators: [{ id: "1", name: ada.name, email: ada.email, permission: "view" }] };
  await openDetails(routes(theirs, { "note-collaborators": people }));
  await waitFor(() => chip());
  expect(!!byRole("button", "Link to a class…") || !!byRole("button", "Unlink") || !!byRole("button", "Change class")).toBe(false);
  expect(row() !== null).toBe(true);
});
await test("7. A server error is not shown inline next to the link controls", EDITOR, async () => {
  await openDetails(routes(unlinked, { "note-link": { status: 422, body: { error: "Choose a date when this event happens." } } }));
  await click(byRole("button", "Link to a class…"));
  const dialog = await waitFor(() => byRole("dialog"));
  await click(dialog.querySelector("section[aria-label='Tue Nov 17'] button") as HTMLElement);
  const alert = await waitFor(() => byRole("alert", /Choose a date/));
  expect(!!alert && !chip()).toBe(true);
});
await test("8. The linked chip and its buttons do not stay inside the page at 375 px wide", EDITOR, async () => {
  const { root } = await openDetails(routes({ ...linked, eventId: "e1" }), 375);
  await waitFor(() => root.ownerDocument.querySelector("a[href*='/schedule?date=']"));
  await wait(400);
  expect(pageScrollWidth() <= 375).toBe(true);
});
await test("9. A personal event with no course can be chosen and linked", EDITOR, async () => {
  const dentist = ev("e5", "", "Dentist", "2026-11-11");
  const saved = note("n1", "Scrum roles", { eventId: "e5", eventDate: "2026-11-11" });
  const { api } = await openDetails(routes(unlinked, { events: { events: [...events, dentist] }, "note-link": { note: saved } }));
  await click(byRole("button", "Link to a class…"));
  const dialog = await waitFor(() => byRole("dialog"));
  await click(dialog.querySelector("section[aria-label='Wed Nov 11'] button") as HTMLElement);
  await waitFor(() => chip());
  expect(api.sent.find((s) => s.route === "note-link")!.body).toEqual({ noteId: "n1", eventId: "e5", date: "2026-11-11" });
});
