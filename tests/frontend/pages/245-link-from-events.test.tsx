// Frontend test: the real Schedule screen and event window with the real Provider; the API is replaced.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles"; // every screen stylesheet, shared first as main.tsx does
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byText, byLabel, click, type, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import { Schedule } from "../../../src/features/schedule";

page({ card: "245", title: "Frontend: Attach notes to an event from the schedule", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const session = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const cse442 = { id: "c-1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const lecture = { id: "21", courseId: "c-1", title: "Design review", kind: "lecture", date: "2026-11-24", time: "10:00", location: "Knox 20",
  description: "", source: "manual", importJobId: null, seriesId: null };
const weekly = { ...lecture, id: "23", title: "Standup", date: "2026-11-17", repeat: { every: 1, days: [2], until: "2026-12-22" } };
const note = (id: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, body: "", excerpt: `Excerpt of ${title}`, courseId: "c-1",
  lectureDate: "2026-11-24", category: "School", visibility: "private", tags: [], createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z",
  pinned: false, eventId: null, eventDate: null, ...extra });
const linked = note("n1", "Wireframe notes", { eventId: "21", eventDate: "2026-11-24" });
const free = note("n2", "Sprint retro");
const friends = note("n3", "Friend's CSE 250 notes", { sharedBy: { id: "9", name: "Grace", courseCode: "CSE 250" }, permission: "view" });
const SCREEN = "src/features/schedule.tsx → EventNotes";
const PICKER = "src/features/schedule.tsx → NotePicker";
const CSS = "src/features/schedule.module.css → .notes, .picker";

// Every request URL is kept, so the notes answer can depend on the query (the harness records only the route).
let url = "";
const urls: string[] = [];
const server = (extra: Record<string, unknown> = {}, events: unknown[] = [lecture]) => {
  const api = stubApi({
    session, courses: { courses: [cse442] }, events: { events },
    notes: () => (url.includes("event=") ? { notes: [linked] } : { notes: [linked, free, friends] }),
    "note-link": (req: { body: any }) => ({ note: { ...free, id: req.body.noteId, title: req.body.noteId === "n2" ? "Sprint retro" : "Wireframe notes",
      eventId: req.body.eventId, eventDate: req.body.eventId ? req.body.date : null } }),
    "note-create": { status: 201, body: { note: note("77", "Design review") } },
    "event-save": (req: { body: Record<string, unknown> }) => ({ status: 201, body: { event: { id: "99", source: "manual", ...req.body } } }),
    ...extra,
  });
  const inner = window.fetch;
  urls.length = 0;
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    url = String(input); urls.push(url);
    return inner(input, init);
  }) as typeof fetch;
  return api;
};
const Opened = () => <p>Opened note {useParams().id}</p>;
const ui = (start = "/schedule?date=2026-11-24") => (
  <MemoryRouter initialEntries={[start]}>
    <Provider><Routes><Route path="/schedule" element={<Schedule />} /><Route path="/notes/:id" element={<Opened />} /></Routes></Provider>
  </MemoryRouter>
);
const sent = (api: { sent: { route: string }[] }, route: string) => api.sent.filter((r) => r.route === route) as { route: string; body: any }[];
const notesSection = () => document.querySelector<HTMLElement>("section[aria-label=Notes]");
const inSection = (name: string) => [...(notesSection()?.querySelectorAll<HTMLElement>("button") ?? [])]
  .find((b) => (b.textContent ?? "").includes(name) || (b.getAttribute("aria-label") ?? "") === name);
const openLecture = async (name = /^10:00 AM Design review/) => {
  await click(await waitFor(() => byRole("button", name)));
  return waitFor(notesSection);
};

await test("1. The Notes section lists no notes, or the wrong ones, for the meeting that was opened", SCREEN + " → useEffect (repo.notes.list)", async () => {
  server();
  mount(ui());
  await openLecture();
  await waitFor(() => notesSection()?.textContent?.includes("Wireframe notes"));
  expect(notesSection()!.textContent!.includes("Excerpt of Wireframe notes")).toBe(true);
  expect(urls.some((u) => u.includes("route=notes&event=21&date=2026-11-24"))).toBe(true);
});
await test("2. Link a note picks from the list but posts no note-link, or the wrong date, or the note is not listed afterwards", SCREEN + " → Link a note, run()", async () => {
  const api = server();
  mount(ui());
  await openLecture();
  await click(inSection("Link a note")!);
  await click(await waitFor(() => byRole("button", /^Sprint retro/)));
  await waitFor(() => sent(api, "note-link").length > 0);
  expect(sent(api, "note-link")[0].body).toEqual({ noteId: "n2", eventId: "21", date: "2026-11-24" });
  expect(sent(api, "note-link")[0].csrf).toBe("test-token");
  await waitFor(() => /Sprint retro/.test(notesSection()!.querySelector("ul")!.textContent!));
});
await test("3. A weekly event links to the day that was opened, not its first day", SCREEN + " → date={occurrence ?? event.date}, Schedule.openEvent", async () => {
  const api = server({}, [weekly]);
  mount(ui());
  await openLecture(/^10:00 AM Standup/);
  await click(inSection("Link a note")!);
  await click(await waitFor(() => byRole("button", /^Sprint retro/)));
  await waitFor(() => sent(api, "note-link").length > 0);
  expect(sent(api, "note-link")[0].body.date).toBe("2026-11-24");
  expect(sent(api, "note-link")[0].body.eventId).toBe("23");
});
await test("4. New note for this event creates no note, links to another event or date, or does not open it", SCREEN + " → New note for this event", async () => {
  const api = server();
  mount(ui());
  await openLecture();
  await click(inSection("New note for this event")!);
  await waitFor(() => byText("Opened note 77"));
  expect(sent(api, "note-create")[0].body.courseId).toBe("c-1");
  expect(sent(api, "note-create")[0].body.lectureDate).toBe("2026-11-24");
  expect(sent(api, "note-link")[0].body).toEqual({ noteId: "77", eventId: "21", date: "2026-11-24" });
  expect(api.sent.findIndex((r) => r.route === "note-create") < api.sent.findIndex((r) => r.route === "note-link")).toBe(true);
});
await test("5. Unlink asks for a confirmation, sends an event id, or leaves the note listed", SCREEN + " → Unlink", async () => {
  const api = server();
  mount(ui());
  await openLecture();
  await click(await waitFor(() => inSection("Unlink Wireframe notes")));
  await waitFor(() => sent(api, "note-link").length > 0);
  expect(sent(api, "note-link")[0].body).toEqual({ noteId: "n1", eventId: null, date: "2026-11-24" });
  await waitFor(() => notesSection()!.textContent!.includes("No notes are attached"));
});
await test("6. Attach notes on a new event links nothing, links before the event exists, or to the wrong event", "src/features/schedule.tsx → EventDialog onSubmit, NotePicker", async () => {
  const api = server();
  mount(ui());
  await waitFor(() => byText("Design review"));
  await click(byRole("button", "Add event"));
  await type(await waitFor(() => byLabel("Title")), "Office hours");
  await click(await waitFor(() => byRole("button", /^Sprint retro/)));
  expect(byRole("button", /^Sprint retro/)!.getAttribute("aria-pressed")).toBe("true");
  await click(byRole("button", "Create event"));
  await waitFor(() => sent(api, "note-link").length > 0);
  expect(sent(api, "note-link")[0].body).toEqual({ noteId: "n2", eventId: "99", date: "2026-11-24" });
  expect(api.sent.findIndex((r) => r.route === "event-save") < api.sent.findIndex((r) => r.route === "note-link")).toBe(true);
});
await test("7. A server message (404 or 422) is hidden or replaced by a generic one", SCREEN + " → run(), error", async () => {
  server({ "note-link": { status: 404, body: { error: "This event could not be found." } } });
  mount(ui());
  await openLecture();
  await click(inSection("Link a note")!);
  await click(await waitFor(() => byRole("button", /^Sprint retro/)));
  await waitFor(() => byText("This event could not be found."));
  server({ "note-link": { status: 422, body: { error: "Choose a date when this event happens." } } });
  mount(ui());
  await openLecture();
  await click(await waitFor(() => inSection("Unlink Wireframe notes")));
  const alert = await waitFor(() => byText("Choose a date when this event happens."));
  expect(alert.getAttribute("role")).toBe("alert");
  expect(notesSection()!.textContent!.includes("Wireframe notes")).toBe(true); // still listed: the unlink failed
});
await test("8. The picker offers a classmate's shared note, or one already attached", PICKER, async () => {
  server();
  mount(ui());
  await openLecture();
  await click(inSection("Link a note")!);
  await waitFor(() => byRole("button", /^Sprint retro/));
  expect(byRole("button", /Friend's CSE 250/) === null).toBe(true);
  expect(document.querySelectorAll("[class*=picker] li").length).toBe(1); // Wireframe notes is attached already
});
await test("9. At 375 px the window with notes and the picker scrolls sideways", CSS, async () => {
  server();
  mount(ui(), { width: 375 });
  const doc = [...document.querySelectorAll("iframe")].pop()!.contentDocument!;
  await click(await waitFor(() => [...doc.querySelectorAll<HTMLElement>("button")].find((b) => /^10:00 AM Design review/.test(b.textContent ?? "")) ?? null));
  await waitFor(() => document.querySelector("section[aria-label=Notes]"));
  await click(inSection("Link a note")!);
  await waitFor(() => document.querySelector("[class*=picker] li"));
  expect(pageScrollWidth() <= 375).toBe(true);
  const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
  expect(dialog.scrollWidth <= dialog.clientWidth).toBe(true);
});
