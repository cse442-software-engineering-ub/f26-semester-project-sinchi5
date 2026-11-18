// Frontend test: the real note editor with Save in the top bar and Details and People tucked into panels, API replaced.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, click, type, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";

page({ card: "242", title: "Frontend: Note panels and Save at the top", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const signedIn = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const cse442 = { id: "c1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const PAGE = "src/features/note-editor.tsx → NoteEditor";
const CSS = "src/features/note-editor.module.css → .details / .people / .inspector";
const note = (extra: Record<string, unknown> = {}) => ({
  id: "n1", ownerId: "1", courseId: "c1", title: "Week 3", body: "<p>Hello</p>", format: "html", excerpt: "", lectureDate: "2026-09-01",
  category: "School", tags: [], pinned: false, visibility: "shared", createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-01T12:00:00Z", remindAt: null, ...extra,
});
const routes = (extra: Record<string, unknown> = {}) => ({
  session: signedIn, notes: { notes: [note()] }, events: { events: [] }, courses: { courses: [cse442] }, "course-notes-shares": { shares: [] },
  "shared-notes": { notes: [] }, friends: { friends: [], incoming: [], outgoing: [] }, note: { note: note() }, "note-versions": { versions: [] },
  "note-collaborators": { collaborators: [] }, "note-comments": { comments: [] }, ...extra,
});
const ui = <MemoryRouter initialEntries={["/notes/n1"]}><Provider><App /></Provider></MemoryRouter>;
let api: ReturnType<typeof stubApi>;
const open = async (width: number, extra: Record<string, unknown> = {}) => {
  api = stubApi(routes(extra));
  const root = mount(ui, { width });
  Object.assign(root.ownerDocument.body.style, { maxWidth: "none", padding: "0" });
  await waitFor(() => root.querySelector(".ProseMirror") && byRole("button", "Save"));
  return root;
};
// byLabel from the harness cannot see wrapped controls inside the phone-width iframe (instanceof across windows), so read the label here.
const field = (name: string) => {
  const doc = ([...document.querySelectorAll("iframe")].at(-1)?.contentDocument ?? document);
  return [...doc.querySelectorAll<HTMLInputElement>("input,select,textarea")].find((e) => (e.getAttribute("aria-label") ?? e.closest("label")?.firstChild?.textContent?.trim()) === name) ?? null;
};
const win = (root: Element) => root.ownerDocument.defaultView!;
const style = (root: Element, el: Element) => win(root).getComputedStyle(el);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bar = () => byRole("button", "Save")!.parentElement!;
const toggle = (name: string) => byRole("button", name)!;
const visible = (root: Element, el: Element | null) => !!el && style(root, el).visibility === "visible" && el.getBoundingClientRect().height > 0;

await test("1. Save, Cancel, Delete note, History, Reminder, Pin, Details or People is missing from the top bar, or Save is still at the bottom", PAGE, async () => {
  const root = await open(1440);
  for (const name of ["Save", "Cancel", "Delete note", "History", "Reminder", "Pin note", "Details", "People"]) {
    expect([name, toggle(name)?.parentElement === bar()]).toEqual([name, true]);
  }
  expect([...root.querySelectorAll("button")].filter((b) => b.textContent === "Save").length).toBe(1);
  expect(byRole("button", "Save")!.getBoundingClientRect().bottom < root.querySelector(".ProseMirror")!.getBoundingClientRect().top).toBe(true);
});
await test("2. Details or People is open when the note first opens, or is remembered from an earlier visit", PAGE, async () => {
  const root = await open(1440);
  expect([toggle("Details").getAttribute("aria-expanded"), toggle("People").getAttribute("aria-expanded")]).toEqual(["false", "false"]);
  expect([visible(root, field("Category")), visible(root, field("Add a comment"))]).toEqual([false, false]);
  expect(toggle("Details").getAttribute("aria-controls")).toBe("note-details");
  expect(toggle("People").getAttribute("aria-controls")).toBe("note-people");
  expect(Object.keys(localStorage).length + Object.keys(sessionStorage).length).toBe(0);
});
await test("3. The Details toggle does not show or hide course, lecture date, category, tags and visibility, or aria-expanded stays wrong", CSS, async () => {
  const root = await open(1440);
  await click(toggle("Details"));
  await wait(400);
  expect(toggle("Details").getAttribute("aria-expanded")).toBe("true");
  for (const label of ["Course", "Lecture date", "Category", "Visibility", "Tags"]) expect([label, visible(root, field(label))]).toEqual([label, true]);
  await click(toggle("Details"));
  await wait(400);
  expect([toggle("Details").getAttribute("aria-expanded"), visible(root, field("Category"))]).toEqual(["false", false]);
});
await test("4. At 1440 the People toggle does not open a right-hand panel with the collaborators and comments", CSS, async () => {
  const root = await open(1440);
  await click(toggle("People"));
  await wait(400);
  const panel = root.querySelector("#note-people")!;
  const editor = root.querySelector(".ProseMirror")!.getBoundingClientRect();
  expect([toggle("People").getAttribute("aria-expanded"), visible(root, panel), panel.getBoundingClientRect().left >= editor.right - 1, style(root, panel).position]).toEqual(["true", true, true, "static"]);
  expect(visible(root, field("Add a comment"))).toBe(true);
});
await test("5. At 375 the People toggle does not open a bottom sheet, Escape does not close it, or focus does not go back to the toggle", CSS, async () => {
  const root = await open(375);
  await click(toggle("People"));
  await wait(400);
  const panel = root.querySelector("#note-people")!;
  const rect = panel.getBoundingClientRect();
  expect([style(root, panel).position, Math.round(rect.bottom) >= win(root).innerHeight - 1, rect.width >= 370, visible(root, panel)]).toEqual(["fixed", true, true, true]);
  (field("Add a comment") as HTMLElement).focus();
  root.ownerDocument.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await wait(400);
  expect([toggle("People").getAttribute("aria-expanded"), visible(root, panel), root.ownerDocument.activeElement === toggle("People")]).toEqual(["false", false, true]);
});
await test("6. History in the top bar does not open the saved versions, so a version cannot be previewed or restored", PAGE, async () => {
  const root = await open(1440, { "note-versions": { versions: [{ id: "v1", noteId: "n1", title: "Old", body: "<p>Old text</p>", author: "Ada", createdAt: "2026-09-01T12:00:00Z" }] } });
  await click(byRole("button", "History"));
  await wait(400);
  expect([toggle("People").getAttribute("aria-expanded"), visible(root, root.querySelector("#note-people"))]).toEqual(["true", true]);
  await click([...root.querySelectorAll("button")].find((b) => b.textContent?.includes("Preview version")) as HTMLElement);
  // The preview window opens on the main page, outside the phone-width frame.
  await waitFor(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Restore version"));
});
await test("7. The Save in the top bar does not save the title and text (format html), or stays enabled when nothing changed", PAGE, async () => {
  await open(1440, { "note-save": (req: any) => ({ note: note({ title: req.body.title, body: req.body.body }) }) });
  expect((byRole("button", "Save") as HTMLButtonElement).disabled).toBe(true);
  await type(field("Note title"), "Week 3 notes");
  expect((byRole("button", "Save") as HTMLButtonElement).disabled).toBe(false);
  await click(byRole("button", "Save"));
  const req = await waitFor(() => api.sent.find((r) => r.route === "note-save"));
  expect([req.body.title, req.body.format, req.body.body]).toEqual(["Week 3 notes", "html", "<p>Hello</p>"]);
  await waitFor(() => (byRole("button", "Save") as HTMLButtonElement).disabled);
});
await test("8. A Details change is lost when it is not saved: the autosave guard no longer sends it", PAGE, async () => {
  await open(1440, { "note-save": (req: any) => ({ note: req.body }) });
  await click(toggle("Details"));
  const select = field("Category")!;
  select.value = "Work";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  const req = await waitFor(() => api.sent.find((r) => r.route === "note-save"), 4000);
  expect(req.body.category).toBe("Work");
});
await test("9. With the panels closed the writing area does not reach the bottom of the window at 1440", PAGE, async () => {
  const root = await open(1440);
  const card = root.querySelector(".ProseMirror")!.closest("section")!.getBoundingClientRect();
  expect([card.bottom <= win(root).innerHeight, card.bottom >= win(root).innerHeight - 60]).toEqual([true, true]);
});
await test("10. The panels do not open with a motion-token transition, or keep animating under reduced motion", CSS, async () => {
  const root = await open(1440);
  expect(style(root, root.querySelector("#note-details")!).transitionDuration.startsWith("0.18s")).toBe(true);
  const reduced = [...document.styleSheets].flatMap((s) => [...s.cssRules])
    .filter((r): r is CSSMediaRule => r instanceof CSSMediaRule && r.conditionText.includes("prefers-reduced-motion"))
    .flatMap((r) => [...r.cssRules] as CSSStyleRule[]).filter((r) => r.selectorText?.includes("details") && r.style.transitionDuration === "0s");
  expect(reduced.length > 0).toBe(true);
});
await test("11. At 320 the bar, panels or text make the page scroll sideways", CSS, async () => {
  await open(320);
  await click(toggle("Details"));
  await click(toggle("People"));
  await wait(400);
  expect(pageScrollWidth() <= 320).toBe(true);
});

// Phone menu (card 242 follow-up): its popup may sit in either window, so look in both.
const menuItems = () => [document, ...[...document.querySelectorAll("iframe")].map((f) => f.contentDocument!)]
  .flatMap((d) => [...d.querySelectorAll<HTMLElement>('[role="menuitem"]')]);
const menuItem = (name: string) => menuItems().find((i) => i.textContent?.trim() === name) ?? null;
await test("12. At 375 the More actions menu does not hold History, Reminder, Pin and Delete note, or one of them stops working", PAGE, async () => {
  const root = await open(375, { "note-pin": () => ({ note: note({ pinned: true }) }) });
  expect(["History", "Reminder", "Pin", "Delete note", "Cancel"].map((n) => [...bar().children].some((c) => c.textContent?.trim() === n))).toEqual([false, false, false, false, false]);
  const more = byRole("button", "More actions")!;
  await click(more);
  await waitFor(() => menuItem("History"));
  expect([more.getAttribute("aria-haspopup"), more.getAttribute("aria-expanded")]).toEqual(["menu", "true"]);
  expect(["History", "Reminder", "Pin", "Cancel", "Delete note"].map((n) => !!menuItem(n))).toEqual([true, true, true, true, true]);
  await click(menuItem("History"));
  await wait(400);
  expect(toggle("People").getAttribute("aria-expanded")).toBe("true");
  await click(byRole("button", "Close panel"));
  await click(more);
  await waitFor(() => menuItem("Reminder"));
  await click(menuItem("Reminder"));
  await waitFor(() => [...document.querySelectorAll("*"), ...root.querySelectorAll("*")].find((e) => e.textContent === "Set reminder"));
  await click([...document.querySelectorAll("button"), ...root.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Close") as HTMLElement);
  await wait(300);
  await click(more);
  await waitFor(() => menuItem("Pin"));
  await click(menuItem("Pin"));
  await waitFor(() => api.sent.find((r) => r.route === "note-pin"));
  await click(more);
  await waitFor(() => menuItem("Delete note"));
  await click(menuItem("Delete note"));
  await waitFor(() => [...document.querySelectorAll("button"), ...root.querySelectorAll("button")].find((b) => b.textContent === "Delete note" && b.closest("[role=dialog]")));
});
await test("13. At 375 the More actions menu does not close with Escape and return focus, or the sheet has no heading or scrim that closes it", CSS, async () => {
  const root = await open(375);
  const more = byRole("button", "More actions")!;
  await click(more);
  await waitFor(() => menuItem("History"));
  root.ownerDocument.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await wait(400);
  expect([menuItems().length, more.getAttribute("aria-expanded")]).toEqual([0, "false"]);
  await click(toggle("People"));
  await wait(400);
  expect([...root.querySelectorAll("h2")].some((h) => h.textContent === "People" && visible(root, h))).toBe(true);
  const scrim = root.querySelector<HTMLElement>('[data-testid="people-scrim"]')!;
  expect(style(root, scrim).position).toBe("fixed");
  await click(scrim);
  await wait(400);
  expect([toggle("People").getAttribute("aria-expanded"), visible(root, root.querySelector("#note-people"))]).toEqual(["false", false]);
});
await test("14. At 320 the top bar needs more than two rows of buttons, or the open sheet covers the bar", PAGE, async () => {
  const root = await open(320);
  const tops = [...bar().children].map((c) => Math.round(c.getBoundingClientRect().top)).sort((a, b) => a - b);
  let rows = 0, start = -100;
  for (const top of tops) if (top - start > 20) { rows++; start = top; }
  expect(rows <= 2).toBe(true);
  await click(toggle("People"));
  await wait(400);
  expect(root.querySelector("#note-people")!.getBoundingClientRect().top >= bar().getBoundingClientRect().bottom - 1).toBe(true);
});
