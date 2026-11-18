// Frontend test: the real app re-reads the server every 30 seconds and when the tab is shown again; forms with unsaved changes must not lose them.
// The 30 s timer is captured (not waited for) and fired by hand; the tab coming back is a real "focus" event.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect, hooks } from "../../shared/runner.js";
import { mount, stubApi, byRole, byLabel, byText, click, type, waitFor } from "../harness";
import { Provider, useApp } from "../../../src/app/context";
import { AddCourseDialog } from "../../../src/features/course-dialog";
import { EventDialog } from "../../../src/features/schedule";
import App from "../../../src/app/App";

page({ card: "257", title: "Frontend: Keep what I am typing when Notely refreshes in the background", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const signedIn = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const cse442 = { id: "c1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const note = {
  id: "n1", ownerId: "1", courseId: "c1", title: "Week 3", body: "<p>Hello</p>", format: "html", excerpt: "", lectureDate: "2026-09-01",
  category: "School", tags: [], pinned: false, visibility: "shared", createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-01T12:00:00Z", remindAt: null,
};
const routes = (extra: Record<string, unknown> = {}) => ({
  session: signedIn, notes: { notes: [note] }, events: { events: [] }, courses: { courses: [cse442] }, "course-notes-shares": { shares: [] },
  "shared-notes": { notes: [] }, friends: { friends: [], incoming: [], outgoing: [] }, note: { note }, "note-versions": { versions: [] },
  "note-collaborators": { collaborators: [] }, "note-comments": { comments: [] },
  ...extra,
});
type Sent = { sent: { route: string }[] };
// One refresh asks for the session once; every read route together tells whether anything was re-read.
const refreshes = (api: Sent) => api.sent.filter((r) => r.route === "session").length;
const reads = (api: Sent) => api.sent.filter((r) => ["session", "onboarding", "courses", "notes", "events"].includes(r.route)).length;
const CTX = "src/app/context.tsx → Provider (recheck, holdRefresh) and useHoldRefresh";

// Captures the Provider's 30-second timer so a case can fire it at once.
const realSetInterval = window.setInterval;
const noTimer = () => { throw new Error("The 30 s timer was never set"); };
let fire: () => void = noTimer;
window.setInterval = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) => {
  if (ms === 30000 && typeof fn === "function") fire = () => (fn as () => void)();
  return realSetInterval(fn, ms, ...(rest as []));
}) as typeof window.setInterval;
hooks.after.push(() => { fire = noTimer; });
const settle = () => new Promise((r) => setTimeout(r, 150));
const tick = async () => { fire(); await settle(); };

// A dialog the case can close by a button outside it.
function Host({ which }: { which: "course" | "event" }) {
  const { state } = useApp();
  const [open, setOpen] = useState(true);
  return <>
    <button onClick={() => setOpen(false)}>Close from outside</button>
    {open && state.ready && state.courses.length > 0 && (which === "course"
      ? <AddCourseDialog onClose={() => setOpen(false)} />
      : <EventDialog date="2026-11-24" onClose={() => setOpen(false)} />)}
  </>;
}
const hosted = (which: "course" | "event") => <MemoryRouter><Provider><Host which={which} /></Provider></MemoryRouter>;
const at = (path: string) => <MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>;
const openNote = async () => {
  const api = stubApi(routes());
  mount(at("/notes/n1"));
  await waitFor(() => byLabel("Note title") && byRole("button", "Save"));
  await settle();
  return api;
};

await test("1. A refresh tick replaces the title typed in the note editor, or re-reads the server", CTX + ", src/features/note-editor.tsx → useHoldRefresh", async () => {
  const api = await openNote();
  await type(byLabel("Note title"), "Week 3 – draft");
  const before = reads(api);
  await tick();
  expect([byLabel("Note title")!.value, reads(api)]).toEqual(["Week 3 – draft", before]);
});
await test("2. The re-read that was skipped does not run right after the unsaved text is cancelled", CTX, async () => {
  const api = await openNote();
  await type(byLabel("Note title"), "Week 3 – draft");
  await tick();
  const before = refreshes(api);
  await click(byRole("button", "Cancel"));
  await settle();
  expect([byLabel("Note title")!.value, refreshes(api) - before]).toEqual(["Week 3", 1]);
});
await test("3. A refresh tick empties or closes the event dialog while it has typed text, or no re-read follows its closing", CTX + ", src/features/schedule.tsx → EventDialog", async () => {
  const api = stubApi(routes());
  mount(hosted("event"));
  await type(await waitFor(() => byLabel("Title")), "Study group");
  await settle();
  const before = reads(api);
  await tick();
  expect([byLabel("Title")?.value, reads(api)]).toEqual(["Study group", before]);
  await click(byText("Close from outside"));
  await settle();
  expect(reads(api) > before).toBe(true);
});
await test("4. A refresh tick empties or closes the add-course dialog while it has typed text, or no re-read follows its closing", CTX + ", src/features/course-dialog.tsx → AddCourseDialog", async () => {
  const api = stubApi(routes());
  mount(hosted("course"));
  await type(await waitFor(() => byLabel("Course code")), "CSE 250");
  await settle();
  const before = reads(api);
  await tick();
  expect([byLabel("Course code")?.value, reads(api)]).toEqual(["CSE 250", before]);
  await click(byText("Close from outside"));
  await settle();
  expect(reads(api) > before).toBe(true);
});
await test("5. Coming back to the tab refreshes over unsaved typing", CTX + " (focus listener)", async () => {
  const api = await openNote();
  await type(byLabel("Note title"), "Week 3 – draft");
  const before = reads(api);
  window.dispatchEvent(new Event("focus"));
  await settle();
  expect([byLabel("Note title")!.value, reads(api)]).toEqual(["Week 3 – draft", before]);
});
await test("6. With nothing unsaved the 30 s refresh, or the refresh on returning to the tab, does not run", CTX, async () => {
  const api = await openNote();
  const before = refreshes(api);
  await tick();
  expect(refreshes(api) - before).toBe(1);
  window.dispatchEvent(new Event("focus"));
  await settle();
  expect(refreshes(api) - before).toBe(2);
});
await test("7. A dialog that was opened and closed leaves a hold behind, so refreshes stay off", CTX + " (holds counter)", async () => {
  const api = stubApi(routes());
  mount(hosted("event"));
  await waitFor(() => byLabel("Title"));
  await click(byText("Close from outside"));
  await settle();
  const before = refreshes(api);
  await tick();
  expect(refreshes(api) - before).toBe(1);
});
await test("8. A tick refreshes over the classmate email typed on the Friends page, or stays off after it is cleared", CTX + ", src/features/friends.tsx → Friends", async () => {
  const api = stubApi(routes());
  mount(at("/friends"));
  await type(await waitFor(() => byLabel("Classmate's email")), "grace@example.edu");
  await settle();
  const before = reads(api);
  await tick();
  expect([byLabel("Classmate's email")!.value, reads(api)]).toEqual(["grace@example.edu", before]);
  await type(byLabel("Classmate's email"), "");
  await settle();
  const cleared = refreshes(api);
  await tick();
  expect(refreshes(api) - cleared).toBe(1);
});
