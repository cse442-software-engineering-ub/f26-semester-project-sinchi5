// Frontend test: the real Notes list and note editor on planner sheets (course dividers, sheet cards, one writing sheet), API replaced.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import "../../../src/features/rich-editor"; // loads the editor chunk and its stylesheet now, so the phone-width frames copy it
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, click, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";

page({ card: "254", title: "Frontend: Notes and the editor sit on planner sheets", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const courses = [
  { id: "c1", code: "CSE 442", name: "Software Engineering", color: "#8b5d33", term: "Fall 2026" },
  { id: "c2", code: "CSE 250", name: "Data Structures", color: "#7d9a76", term: "Fall 2026" },
  { id: "c3", code: "MTH 306", name: "Differential Equations", color: "#6f8fa0", term: "Fall 2026" },
];
const note = (id: string, title: string, courseId: string, extra: Record<string, unknown> = {}) => ({
  id, ownerId: "1", courseId, title, body: `<p>Body of ${title}</p>`, format: "html", excerpt: `Body of ${title}`, lectureDate: "2026-11-10", category: "School",
  tags: [], pinned: false, visibility: "private", createdAt: "2026-11-10T12:00:00Z", updatedAt: "2026-11-12T12:00:00Z", remindAt: null, ...extra,
});
const notes = [
  note("n1", "Scrum roles", "c1", { pinned: true, visibility: "shared" }), note("n2", "Sprint review", "c1"), note("n3", "Retrospectives", "c1"),
  note("n4", "Amortized analysis", "c2"), note("n5", "Hash collisions", "c2"), note("n6", "Binary heaps", "c2"), note("n7", "Laplace transforms", "c3"),
  note("n8", "Reading list", "", { category: "Personal" }), note("n9", "Graph search", "c2"), note("n10", "Dynamic arrays", "c2"),
];
const session = (preferences?: unknown) => ({ user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "t", preferences });
const routes = (extra: Record<string, unknown> = {}, preferences?: unknown) => ({
  session: session(preferences), notes: { notes }, events: { events: [] }, courses: { courses }, "course-notes-shares": { shares: [] },
  "shared-notes": { notes: [{ ...note("s1", "Midterm study guide", "c2"), ownerId: "9", sharedBy: { name: "Grace Hopper", courseCode: "CSE 250" } }] },
  friends: { friends: [], incoming: [], outgoing: [] }, note: { note: note("n1", "Scrum roles", "c1", { pinned: true, visibility: "shared" }) },
  "note-versions": { versions: [] }, "note-collaborators": { collaborators: [] }, "note-comments": { comments: [] }, ...extra,
});
const at = (path: string, width?: number) => {
  const root = mount(<MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>, { width });
  Object.assign(root.ownerDocument.body.style, { maxWidth: "none", padding: "0" });
  return root;
};
const win = (root: Element) => root.ownerDocument.defaultView!;
const box = (el: Element) => el.getBoundingClientRect();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const lum = (c: string) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const openList = async (width: number, extra: Record<string, unknown> = {}, preferences?: unknown) => {
  stubApi(routes(extra, preferences));
  const root = at("/notes", width);
  await waitFor(() => root.querySelectorAll("main h3").length >= 9);
  await wait(400); // the frame's copied stylesheets finish loading and the cards' entrance animation ends
  return root;
};
const openEditor = async (width: number, preferences?: unknown) => {
  stubApi(routes({}, preferences));
  const root = at("/notes/n1", width);
  await waitFor(() => root.querySelector(".ProseMirror") && byRole("button", "Save"));
  await wait(400);
  return root;
};
const sheetOf = (root: Element) => root.querySelector(".ProseMirror")!.closest("section")!;

const LIST = "src/features/notes-list.tsx → groupByCourse, notes-list.module.css";
const EDITOR = "src/features/note-editor.module.css → .editor / .editorTop / .inspector";
const TOOLBAR = "src/features/rich-editor.tsx → Toolbar (groups), rich-editor.module.css → .toolbarWrap / .group";

await test("1. Notes are not under one divider per course with its name and note count, or Shared with me is not its own section", LIST, async () => {
  const root = await openList(1440);
  const sections = [...root.querySelectorAll("main section[aria-labelledby]")];
  const heads = sections.map((s) => s.querySelector("h2")!.textContent!.replace(/\s+/g, " ").trim());
  expect(heads.slice(0, 4)).toEqual(["CSE 442Software Engineering3 notes", "CSE 250Data Structures5 notes", "MTH 306Differential Equations1 note", "No course1 note"]);
  expect(heads[4].startsWith("Shared with me")).toBe(true);
  expect(sections[0].querySelectorAll("h3").length).toBe(3);
  const shared = root.querySelector('section[aria-label="Shared with me"]')!;
  expect(shared.contains(sections[0])).toBe(false);
  expect(box(shared).top > box(sections[3]).bottom).toBe(true);
});
await test("2. A pinned note is not marked by a ribbon corner, or an unpinned note has one", "src/shared/ui.tsx → NoteCard, ui.module.css → .pinRibbon", async () => {
  const root = await openList(1440);
  const cards = [...root.querySelectorAll<HTMLElement>("main a[href^='/notes/']")];
  const ribbon = (a: HTMLElement) => a.querySelector('[class*="pinRibbon"]');
  expect(cards.filter((a) => ribbon(a)).map((a) => a.querySelector("h3")!.textContent)).toEqual(["Scrum roles"]);
  const r = box(ribbon(cards[0])!);
  expect(r.height > r.width).toBe(true);
  expect(win(root).getComputedStyle(ribbon(cards[0])!).clipPath !== "none").toBe(true);
  expect(cards[0].querySelector("time")?.getAttribute("datetime")).toBe("2026-11-12T12:00:00Z");
});
await test("3. The search, course, category and sort controls are not one aligned 44 px row at 1440, or the page scrolls sideways at 375", "src/features/notes-list.module.css → .libraryToolbar", async () => {
  const root = await openList(1440);
  const search = root.querySelector('[aria-label="Search notes"]')!.closest("label")!;
  const controls = [search, ...["Course", "Category", "Sort notes"].map((n) => root.querySelector(`select[aria-label="${n}"]`)!)];
  const boxes = controls.map(box);
  expect(boxes.every((b) => Math.abs(b.top - boxes[0].top) <= 1)).toBe(true);
  expect(boxes.map((b) => Math.round(b.height))).toEqual([44, 44, 44, 44]);
  await openList(375);
  expect(pageScrollWidth() <= 375).toBe(true);
});
await test("4. The course and category selects are missing their choices, or an empty account or empty search gives no specific next step", LIST, async () => {
  const root = await openList(1440);
  expect([...(root.querySelector('select[aria-label="Course"]') as HTMLSelectElement).options].map((o) => o.text)).toEqual(["All courses", "CSE 442", "CSE 250", "MTH 306"]);
  expect([...(root.querySelector('select[aria-label="Category"]') as HTMLSelectElement).options].map((o) => o.text)).toEqual(["All categories", "School", "Work", "Meetings", "Personal"]);
  stubApi(routes({ notes: { notes: [] } }));
  const empty = at("/notes", 1440);
  await waitFor(() => byRole("heading", "No notes found"));
  expect(/first note/.test(empty.querySelector("main")!.textContent!)).toBe(true);
  stubApi(routes({ notes: { notes: [] } }));
  const filtered = at("/notes?q=zzz", 1440);
  await waitFor(() => /Nothing matches/.test(filtered.textContent ?? ""));
  expect([...filtered.querySelectorAll("button")].some((b) => b.textContent === "Clear search and filters")).toBe(true);
});
await test("5. The notes grid does not use the width (fewer than 3 columns at 1440 or 4 at 1920), or the cards in a row are not aligned", "src/features/notes-list.module.css → .group .grid", async () => {
  for (const [width, want] of [[1440, 3], [1920, 4]] as const) {
    const root = await openList(width);
    const grid = root.querySelector("main h3")!.closest("div[class*=noteGrid]") as HTMLElement;
    expect(win(root).getComputedStyle(grid).gridTemplateColumns.split(" ").length >= want).toBe(true);
    const tops = [...grid.querySelectorAll("a")].slice(0, 3).map((a) => Math.round(box(a).top));
    expect(tops.every((t) => t === tops[0])).toBe(true);
  }
});
await test("6. The formatting toolbar is not sticky inside the writing sheet, grouped as text style, font, color, lists, align, insert and history", TOOLBAR, async () => {
  const root = await openEditor(1440);
  const bar = root.querySelector('[role="toolbar"]')!;
  expect(sheetOf(root).contains(bar)).toBe(true);
  expect(win(root).getComputedStyle(bar.parentElement!).position).toBe("sticky");
  const groups = [...bar.querySelectorAll('[role="group"]')];
  expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual(["Text style", "Font and size", "Color and highlight", "Lists", "Alignment", "Insert", "History"]);
  expect(groups.slice(0, -1).every((g) => win(root).getComputedStyle(g, "::after").width === "1px") && win(root).getComputedStyle(groups[0], "::before").content === "none").toBe(true);
  expect(win(root).getComputedStyle(groups.at(-1)!, "::after").content).toBe("none");
  expect(new Set(groups.map((g) => Math.round(box(g).top))).size <= 2).toBe(true);
  const phone = (await openEditor(375)).querySelector('[role="toolbar"]') as HTMLElement;
  expect(phone.ownerDocument.defaultView!.getComputedStyle(phone).overflowX).toBe("auto");
});
await test("7. The writing area does not have generous line height, or the top bar is not one line above the sheet", EDITOR, async () => {
  const root = await openEditor(1920);
  const text = root.querySelector(".ProseMirror") as HTMLElement;
  const sheet = sheetOf(root);
  const cs = win(root).getComputedStyle(text);
  expect(parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) >= 1.7).toBe(true);
  const bar = byRole("button", "Save")!.parentElement!;
  const mids = [...bar.children].map((c) => Math.round(box(c).top + box(c).height / 2));
  expect(Math.max(...mids) - Math.min(...mids) <= 2).toBe(true);
  expect(box(bar).bottom <= box(sheet).top).toBe(true);
});
await test("8. People is not a facing page beside the sheet at 1440, or a bottom sheet at 375, or the editor scrolls sideways at 320", EDITOR, async () => {
  const root = await openEditor(1440);
  await click(byRole("button", "People"));
  await wait(400);
  const people = root.querySelector("#note-people") as HTMLElement;
  expect(box(people).left >= box(sheetOf(root)).right && Math.abs(box(people).top - box(sheetOf(root)).top) < 4).toBe(true);
  expect(win(root).getComputedStyle(people).boxShadow !== "none").toBe(true);
  const phone = await openEditor(375);
  await click(byRole("button", "People"));
  await wait(400);
  const sheet = phone.querySelector("#note-people") as HTMLElement;
  expect(win(phone).getComputedStyle(sheet).position).toBe("fixed");
  expect(Math.round(box(sheet).bottom) >= 698).toBe(true);
  await openEditor(320);
  await click(byRole("button", "Details"));
  await click(byRole("button", "People"));
  await wait(400);
  expect(pageScrollWidth() <= 320).toBe(true);
});
await test("9. On a dark scheme or a custom theme the card text, divider or writing text is under 4.5:1 on its sheet", "src/features/notes-list.module.css, rich-editor.module.css (colors must be variables)", async () => {
  const custom = { mode: "light", scheme: "custom:t1", customThemes: [{ id: "t1", name: "Plum", accent: "#7b3f8c", background: "#f6f0f8", text: "#2b2233" }] };
  for (const prefs of [{ mode: "dark", scheme: "fjord" }, custom]) {
    const list = await openList(1440, {}, prefs);
    const bg = win(list).getComputedStyle(list.querySelector("main section[aria-label='Notes']")!).backgroundColor;
    for (const el of [list.querySelector("main h3")!, list.querySelector("main h2 strong")!, list.querySelector("main p[class*=excerpt]")!]) {
      expect(contrast(win(list).getComputedStyle(el).color, bg) >= 4.5).toBe(true);
    }
    const editor = await openEditor(1440, prefs);
    const text = editor.querySelector(".ProseMirror")!;
    expect(contrast(win(editor).getComputedStyle(text).color, win(editor).getComputedStyle(sheetOf(editor)).backgroundColor) >= 4.5).toBe(true);
  }
});
await test("10. At 375 the More actions menu is not there on the first paint of the editor (the phone bar was set after paint), so cases 13 and 14 of the note-panels page fail at random", "src/features/note-editor.tsx → useLayoutEffect (phone)", async () => {
  for (let i = 0; i < 5; i++) {
    await openEditor(375);
    expect(!!byRole("button", "More actions")).toBe(true);
    expect(byRole("button", "Cancel")).toBe(null);
  }
});
await test("11. Creating a note does not open the full note page (a dialog appears instead)", "src/features/notes-list.tsx → openCreateNote", async () => {
  const api = stubApi(routes({ "note-create": { note: note("n99", "Untitled note", "") } }));
  const root = at("/notes", 1440);
  await waitFor(() => root.querySelectorAll("main h3").length >= 9);
  await click([...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Create note")!);
  await waitFor(() => root.querySelector(".ProseMirror"));
  expect(root.querySelector('[role="dialog"]')).toBe(null);
  expect(root.ownerDocument.activeElement?.getAttribute("aria-label")).toBe("Note title");
  expect(api !== undefined).toBe(true);
});
await test("12. The writing area is under 80% of the main column width at 1440", EDITOR, async () => {
  const root = await openEditor(1440);
  expect(box(root.querySelector(".ProseMirror")!).width >= box(root.querySelector("main")!).width * 0.8).toBe(true);
});
await test("13. The editor outline is clipped: its top edge is outside the visible box", "src/features/rich-editor.module.css → .ProseMirror:focus-visible", async () => {
  const root = await openEditor(1440);
  const text = root.querySelector(".ProseMirror") as HTMLElement;
  text.focus();
  const cs = win(root).getComputedStyle(text);
  const ring = box(text).top - parseFloat(cs.outlineOffset) - parseFloat(cs.outlineWidth);
  expect(ring >= box(root.querySelector('[role="toolbar"]')!.parentElement!).bottom).toBe(true);
});
await test("14. The note page scrolls sideways at 375", EDITOR, async () => {
  await openEditor(375);
  expect(pageScrollWidth() <= 375).toBe(true);
});
await test("15. The focus outline is the same distance from the text box on all four sides (within 1 px)", "src/features/rich-editor.module.css → .ProseMirror:focus-visible", async () => {
  for (const width of [1440, 768, 375]) {
  const root = await openEditor(width);
  const text = root.querySelector(".ProseMirror") as HTMLElement;
  text.focus();
  const cs = win(root).getComputedStyle(text);
  const gap = parseFloat(cs.outlineOffset); // the ring is drawn this far from every edge of the box
  const b = box(text), bar = box(root.querySelector('[role="toolbar"]')!.parentElement!);
  const ringTop = b.top - gap - parseFloat(cs.outlineWidth);
  expect(cs.outlineStyle).toBe("solid");
  expect(Math.abs(gap + parseFloat(cs.outlineWidth)) <= 1).toBe(true); // on the edge: ring and box coincide on every side
  expect(ringTop >= bar.bottom - 1).toBe(true);
  }
});
await test("16. The first line of text starts within the box's top padding (not a line lower)", "src/features/rich-editor.module.css → .ProseMirror padding", async () => {
  for (const width of [1440, 768, 375]) {
  const root = await openEditor(width);
  const text = root.querySelector(".ProseMirror") as HTMLElement;
  const cs = win(root).getComputedStyle(text);
  const first = text.firstElementChild as HTMLElement;
  const topGap = box(first).top - box(text).top - parseFloat(cs.paddingTop);
  const sideGap = box(first).left - box(text).left - parseFloat(cs.paddingLeft);
  expect(Math.abs(topGap) <= 1).toBe(true);
  expect(Math.abs(sideGap) <= 1).toBe(true);
  expect(parseFloat(cs.paddingTop)).toBe(parseFloat(cs.paddingLeft));
  expect(parseFloat(cs.paddingTop) < parseFloat(cs.fontSize) * 1.2).toBe(true); // a small gap, never a line
  }
});
