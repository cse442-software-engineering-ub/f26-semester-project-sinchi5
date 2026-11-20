// Frontend test: the real note editor (TipTap + formatting toolbar) inside the real app, with the API replaced.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byLabel, byText, click, type, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";
import { FONTS, SIZES } from "../../../src/features/rich-editor";

page({ card: "241", title: "Frontend: Formatting toolbar for notes", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const signedIn = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const cse442 = { id: "c1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const PAGE = "src/features/rich-editor.tsx → RichEditor";
const note = (body: string, extra: Record<string, unknown> = {}) => ({
  id: "n1", ownerId: "1", courseId: "c1", title: "Week 3", body, excerpt: "", lectureDate: "2026-09-01", category: "School", tags: [],
  pinned: false, visibility: "private", createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-01T12:00:00Z", remindAt: null, ...extra,
});
const routes = (n: ReturnType<typeof note>, extra: Record<string, unknown> = {}) => ({
  session: signedIn, notes: { notes: [n] }, events: { events: [] }, courses: { courses: [cse442] }, "course-notes-shares": { shares: [] },
  "shared-notes": { notes: [] }, friends: { friends: [], incoming: [], outgoing: [] }, note: { note: n }, "note-versions": { versions: [] },
  "note-collaborators": { collaborators: [] }, "note-comments": { comments: [] }, ...extra,
});
const ui = (path: string) => <MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>;
let api: ReturnType<typeof stubApi>;
const open = async (n: ReturnType<typeof note>, extra: Record<string, unknown> = {}, width?: number) => {
  api = stubApi(routes(n, extra));
  const root = mount(ui("/notes/n1"), width ? { width } : {});
  if (width) Object.assign(root.ownerDocument.body.style, { maxWidth: "none", padding: "0" });
  await waitFor(() => root.querySelector(".ProseMirror") && byRole("button", "Bold"));
  return root;
};
// The TipTap editor behind the page's text area (ProseMirror keeps it on its root element).
const ed = (root: Element) => (root.querySelector(".ProseMirror") as any).editor;
const tick = () => new Promise((r) => setTimeout(r, 30));
const choose = async (select: HTMLSelectElement | null, value: string) => {
  select!.value = value;
  select!.dispatchEvent(new Event("change", { bubbles: true }));
  await tick();
};
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

await test("1. A saved body shows as plain tags or unformatted text: bold, heading, checklist or highlight is not drawn", PAGE, async () => {
  const body = '<h2>Plan</h2><p>Read <strong>chapter 3</strong> and <mark data-color="yellow">review</mark></p>'
    + '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Buy ink</p></li><li data-type="taskItem" data-checked="false"><p>Print</p></li></ul>';
  const root = await open(note(body));
  const pm = root.querySelector(".ProseMirror")!;
  expect(pm.querySelector("h2")?.textContent).toBe("Plan");
  expect(pm.querySelector("strong")?.textContent).toBe("chapter 3");
  expect(pm.querySelector('mark[data-color="yellow"]')?.textContent).toBe("review");
  const boxes = [...pm.querySelectorAll<HTMLInputElement>('ul[data-type="taskList"] input[type=checkbox]')].map((b) => b.checked);
  expect(boxes).toEqual([true, false]);
  expect((pm.textContent ?? "").includes("<")).toBe(false);
});
await test("2. A toolbar button does not change the text, or does not show as pressed (bold, italic, heading, list, align)", PAGE, async () => {
  const root = await open(note("<p>Hello world</p>"));
  const cases: [string, RegExp][] = [["Bold", /<strong>Hello world<\/strong>/], ["Italic", /<em>/], ["Underline", /<u>/], ["Strikethrough", /<s>/],
    ["Heading 1", /<h1>/], ["Heading 3", /<h3>/], ["Bulleted list", /<ul>/], ["Numbered list", /<ol>/], ["Checklist", /data-type="taskList"/],
    ["Align center", /text-align: center/], ["Justify", /text-align: justify/], ["Quote", /<blockquote>/], ["Code", /<code>/]];
  for (const [name, want] of cases) {
    ed(root).commands.setContent("<p>Hello world</p>");
    ed(root).commands.selectAll();
    await tick();
    expect(byRole("button", name)?.getAttribute("aria-pressed")).toBe("false");
    await click(byRole("button", name));
    expect([name, want.test(ed(root).getHTML())]).toEqual([name, true]);
    await waitFor(() => byRole("button", name)?.getAttribute("aria-pressed") === "true").catch(() => { throw new Error(`${name} did not show as pressed`); });
  }
});
await test("3. The font or size menu offers a value the server would drop, or choosing one does not style the text", PAGE, async () => {
  const root = await open(note("<p>Hello</p>"));
  const values = (label: string) => [...byLabel(label)!.querySelectorAll("option")].map((o) => o.value).filter(Boolean);
  expect(values("Font family")).toEqual(FONTS.map((f) => f[1]));
  expect(values("Font size")).toEqual(SIZES.map((n) => `${n}px`));
  expect([...byLabel("Font family")!.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Font", ...FONTS.map((f) => f[0])]);
  ed(root).commands.selectAll();
  await choose(byLabel("Font family"), '"Times New Roman", Times, serif');
  await choose(byLabel("Font size"), "24px");
  const html = ed(root).getHTML();
  expect(html.includes("font-family: &quot;Times New Roman&quot;, Times, serif") || html.includes('font-family: "Times New Roman", Times, serif')).toBe(true);
  expect(html.includes("font-size: 24px")).toBe(true);
});
await test("4. Save sends the body as plain text, or in a shape the server drops (task list, highlight color, style)", PAGE, async () => {
  const body = '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Buy ink</p></li></ul>'
    + '<p><mark data-color="#ffee00" style="background-color: #ffee00">lit</mark> <span style="font-size: 18px; color: #112233">big</span></p>';
  const root = await open(note(body), { "note-save": (req: any) => ({ note: note(req.body.body) }) });
  ed(root).commands.focus("end");
  ed(root).commands.insertContent(" end");
  await waitFor(() => byRole("button", "Save")?.hasAttribute("disabled") === false).catch(() => { throw new Error("Save stayed disabled after typing"); });
  await click(byRole("button", "Save"));
  const req = await waitFor(() => api.sent.find((r) => r.route === "note-save")).catch(() => { throw new Error(`no note-save; requests: ${api.sent.map((r) => r.route)}`); });
  expect([req.body.format, "highlights" in req.body || "checklist" in req.body]).toEqual(["html", false]);
  const doc = parse(req.body.body);
  expect(doc.querySelector('ul[data-type="taskList"] > li[data-type="taskItem"][data-checked="true"] > p')?.textContent ?? doc.body.innerHTML).toBe("Buy ink");
  const mark = doc.querySelector("mark")!;
  expect(mark.getAttribute("data-color")).toBe("#ffee00");
  expect(/^background-color: (#ffee00|rgb\(255, 238, 0\));?$/.test(mark.getAttribute("style") ?? "")).toBe(true);
  const style = doc.querySelector("span")?.getAttribute("style") ?? "";
  expect(/font-size: 18px/.test(style) && /color: (#112233|rgb\(17, 34, 51\))/.test(style) ? "ok" : style).toBe("ok");
  await waitFor(() => byText("All changes saved")).catch(() => { throw new Error(`no saved status; requests: ${api.sent.map((r) => r.route)}; ${root.querySelector("[role=status]")?.textContent}`); });
});
await test("5. A javascript: link is accepted, or a good link is refused, in the link form", PAGE, async () => {
  const root = await open(note("<p>Hello</p>"));
  ed(root).commands.selectAll();
  await click(byRole("button", "Link"));
  await type(byLabel("Link address"), "javascript:alert(1)");
  await click(byRole("button", "Apply link"));
  await waitFor(() => byRole("alert", /http:\/\/, https:\/\/ or mailto:/));
  expect(ed(root).getHTML().includes("href")).toBe(false);
  await type(byLabel("Link address"), "https://example.com/a");
  await click(byRole("button", "Apply link"));
  await waitFor(() => ed(root).getHTML().includes('href="https://example.com/a"'));
  expect(byRole("alert") === null || !/mailto/.test(byRole("alert")!.textContent ?? "")).toBe(true);
});
await test("6. Undo or Redo does nothing, or stays on when there is nothing to undo", PAGE, async () => {
  const root = await open(note("<p>Hello</p>"));
  expect(byRole("button", "Undo")!.hasAttribute("disabled")).toBe(true);
  ed(root).commands.focus("end");
  ed(root).commands.insertContent(" ZZZ");
  await waitFor(() => !byRole("button", "Undo")!.hasAttribute("disabled"));
  await click(byRole("button", "Undo"));
  expect(ed(root).getHTML().includes("ZZZ")).toBe(false);
  await waitFor(() => !byRole("button", "Redo")!.hasAttribute("disabled"));
  await click(byRole("button", "Redo"));
  expect(ed(root).getHTML().includes("ZZZ")).toBe(true);
});
await test("7. Clear formatting leaves the heading, bold or color on the text", PAGE, async () => {
  const root = await open(note('<h2 style="text-align: center"><strong><span style="color: #aa0000">Hi</span></strong></h2>'));
  ed(root).commands.selectAll();
  await click(byRole("button", "Clear formatting"));
  expect(ed(root).getHTML()).toBe("<p>Hi</p>");
});
await test("8. The reminder control stopped working: no note-reminder request with the chosen time", "src/features/note-editor.tsx → setReminder", async () => {
  const sent: any[] = [];
  await open(note("<p>Hello</p>"), { "note-reminder": (req: any) => { sent.push(req.body); return { note: note("<p>Hello</p>", { remindAt: req.body.remindAt }) }; } });
  await click(byRole("button", /Reminder/));
  await type(byLabel("Date"), "2099-01-01");
  await type(byLabel("Time"), "10:00");
  await click(byRole("button", "Set reminder"));
  await waitFor(() => sent.length === 1);
  expect(sent[0].id).toBe("n1");
  expect(typeof sent[0].remindAt).toBe("string");
});
await test("9. A list or Today card shows tags (<p>, <strong>) from a body, or ignores the server excerpt", "src/services/noteText.ts → notePreview", async () => {
  const withExcerpt = note("<p>Plain <strong>words</strong></p>", { id: "n1", title: "A", excerpt: "Plain words" });
  const noExcerpt = note("<p>No <em>excerpt</em> here</p>", { id: "n2", title: "B", excerpt: undefined });
  const attack = note("<p>x</p>", { id: "n3", title: "C", excerpt: "<img src=x onerror=alert(1)>" });
  for (const path of ["/notes", "/"]) {
    stubApi({ ...routes(withExcerpt), notes: { notes: [withExcerpt, noExcerpt, attack] } });
    const root = mount(ui(path));
    await waitFor(() => root.querySelector("main h2, main h3"));
    await waitFor(() => (root.querySelector("main")?.textContent ?? "").includes("Plain words")).catch(() => { throw new Error(`${path}: ${root.querySelector("main")?.textContent}`); });
    const main = root.querySelector("main")!;
    const text = main.textContent ?? "";
    expect([path, /<\/?(p|strong|em)>/.test(text), main.querySelector("img") === null]).toEqual([path, false, true]);
    if (path === "/notes") expect([text.includes("No excerpt here"), text.includes("<img src=x onerror=alert(1)>")]).toEqual([true, true]);
  }
});
await test("10. The toolbar pushes the page sideways at 320 px, or its buttons are unnamed, unreachable or under 44 px", "src/features/rich-editor.module.css → .toolbar", async () => {
  const root = await open(note("<p>Hello</p>"), {}, 320);
  const win = root.ownerDocument.defaultView!;
  const bar = root.querySelector<HTMLElement>('[role="toolbar"]')!;
  expect([pageScrollWidth() <= 320, bar.scrollWidth > bar.clientWidth, win.getComputedStyle(bar).overflowX]).toEqual([true, true, "auto"]);
  const controls = [...bar.querySelectorAll<HTMLElement>("button, select")];
  expect(controls.length >= 25).toBe(true);
  const offenders = controls.filter((c) => !c.getAttribute("aria-label") || c.getAttribute("tabindex") === "-1" || c.getBoundingClientRect().height < 44)
    .map((c) => `${c.getAttribute("aria-label")} ${Math.round(c.getBoundingClientRect().height)}px`);
  expect(offenders).toEqual([]);
});
const TASKS = '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Buy ink</p></li><li data-type="taskItem" data-checked="false"><p>Print the slides for Thursday and bring them to the lab</p></li></ul>';
const sameRow = (root: Element) =>
  [...root.querySelectorAll('.ProseMirror ul[data-type="taskList"] > li')].map((li) => {
    const box = li.querySelector("input")!.getBoundingClientRect(), text = li.querySelector("p")!.getBoundingClientRect();
    return box.width > 0 && box.top < text.bottom && box.bottom > text.top && box.left < text.left;
  });
await test("11. A checklist box sits under its text instead of beside it, in the editor or the read-only shared view", "src/features/rich-editor.module.css → ul[data-type=taskList]", async () => {
  const root = await open(note(TASKS), {}, 375);
  expect(sameRow(root)).toEqual([true, true]);
  stubApi(routes(note(TASKS, { sharedBy: { id: "2", name: "Grace", courseCode: "CSE 442" }, permission: "view" })));
  const shared = mount(ui("/notes/n1"), { width: 375 });
  await waitFor(() => shared.querySelector('.ProseMirror ul[data-type="taskList"] input'));
  expect(sameRow(shared)).toEqual([true, true]);
});
await test("12. The toolbar scrolls sideways on a wide screen so tools are cut off, or it is not sticky", "src/features/rich-editor.module.css → .toolbar", async () => {
  const root = await open(note("<p>Hello</p>"), {}, 1440);
  const win = root.ownerDocument.defaultView!;
  const bar = root.querySelector<HTMLElement>('[role="toolbar"]')!;
  expect([bar.scrollWidth === bar.clientWidth, win.getComputedStyle(bar.parentElement!).position]).toEqual([true, "sticky"]);
  const right = Math.max(...[...bar.querySelectorAll("button, select")].map((c) => c.getBoundingClientRect().right));
  expect(right <= bar.getBoundingClientRect().right).toBe(true);
});
