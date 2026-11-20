// Frontend test: card 255, the Courses list, the course page and the syllabus upload on planner sheets, with the API replaced.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byText, click, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";
import { buildPalette, contrastRatio } from "../../../src/services/palette";

page({ card: "255", title: "Frontend: Courses and syllabus upload sit on planner sheets", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const signedIn = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const course = (id: string, code: string, name: string, color: string) => ({ id, code, name, color, term: "Fall 2026" });
const cse442 = course("c1", "CSE 442", "Software Engineering", "#869D7A");
const cse250 = course("c2", "CSE 250", "Data Structures", "#7A8D9D");
const mth306 = course("c3", "MTH 306", "Linear Algebra", "#9D8A7A");
const many = [cse442, cse250, mth306, course("c4", "CSE 220", "Systems Programming", "#8A7A9D"), course("c5", "PHY 107", "College Physics", "#9D7A7A"), course("c6", "STA 301", "Probability", "#7A9D8F")];
const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ev = (id: string, title: string, kind: string, date: string, extra: object = {}) => ({ id, courseId: "c1", title, kind, date, time: "10:00", location: "", description: "", source: "manual", seriesId: null, ...extra });
const events = [
  ev("e1", "Midterm exam", "exam", day(9)), ev("e2", "Homework 3", "assignment", day(0), { time: "23:59" }),
  ...[1, 3].map((n, i) => ev(`m${i}`, "CSE 442 Lecture", "lecture", day(n), { seriesId: "s1" })),
];
const note = (id: string, courseId: string, lectureDate: string) => ({ id, courseId, title: "Note " + id, body: "", lectureDate, category: "School", tags: [], pinned: false, updatedAt: "2026-09-01T12:00:00Z" });
const routes = (extra: Record<string, unknown> = {}) => ({
  session: signedIn, notes: { notes: [note("n1", "c1", day(-2)), note("n2", "c1", day(-9))] }, events: { events },
  courses: { courses: [cse442, cse250, mth306] }, "course-notes-shares": { shares: [] }, ...extra,
});
const ui = (path: string) => <MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>;
const wide = (el: HTMLElement) => { Object.assign(el.ownerDocument.body.style, { maxWidth: "none", padding: "0", margin: "0" }); return el; };
const inMain = (root: Element, name: string) => [...root.querySelectorAll<HTMLElement>("main button")].find((b) => (b.textContent ?? "").trim() === name) ?? null;
const win = (el: Element) => el.ownerDocument.defaultView!;
const hex = (rgb: string) => "#" + (rgb.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
const cards = (root: Element) => [...root.querySelectorAll<HTMLElement>('main a[href^="/courses/"]')];
const LIST = "src/features/courses.tsx → Courses, src/features/courses.module.css";
const COURSE = "src/features/course-page.tsx → CoursePage, src/features/course-page.module.css";

await test("1. A course card does not show its tab, code, name, class times, notes and upcoming items", LIST, async () => {
  stubApi(routes());
  const root = mount(ui("/courses"));
  await waitFor(() => cards(root).length === 3);
  const first = cards(root)[0];
  for (const want of ["CSE 442", "Software Engineering", "Fall 2026", "Lecture Mon", "2 notes", "2 upcoming items"]) expect([want, (first.textContent ?? "").includes(want)]).toEqual([want, true]);
  const tab = first.querySelector("i")!;
  expect(win(tab).getComputedStyle(tab).backgroundColor).toBe("rgb(134, 157, 122)");
});
await test("2. With no courses the page does not lead with Upload syllabus, or loses Add course", LIST, async () => {
  stubApi(routes({ courses: { courses: [] } }));
  const root = mount(ui("/courses"));
  await waitFor(() => byRole("heading", "No courses yet"));
  const buttons = [...root.querySelectorAll<HTMLElement>("main button")].map((b) => (b.textContent ?? "").trim());
  expect(buttons).toEqual(["Upload syllabus", "Add course"]);
  expect(root.querySelector("main section")!.textContent!.includes("Notely finds your class times")).toBe(true);
});
await test("3. The course cards do not fill a 1440 px screen in aligned columns, or do not stack on a 375 px phone", LIST + " (.grid)", async () => {
  stubApi(routes({ courses: { courses: many } }));
  let root = wide(mount(ui("/courses"), { width: 1440 }));
  await waitFor(() => cards(root).length === 6);
  let boxes = cards(root).map((c) => c.getBoundingClientRect());
  const firstRow = boxes.filter((b) => Math.round(b.top) === Math.round(boxes[0].top));
  expect([firstRow.length >= 2, new Set(firstRow.map((b) => Math.round(b.height))).size === 1, Math.max(...boxes.map((b) => b.right)) > 1440 - 200]).toEqual([true, true, true]);
  root = wide(mount(ui("/courses"), { width: 375 }));
  await waitFor(() => cards(root).length === 6);
  boxes = cards(root).map((c) => c.getBoundingClientRect());
  expect([new Set(boxes.map((b) => Math.round(b.left))).size, pageScrollWidth() <= 375]).toEqual([1, true]);
});
await test("4. The course page is not two facing pages (lectures left, coming up right), or does not stack on a phone", COURSE, async () => {
  stubApi(routes());
  let root = wide(mount(ui("/courses/c1"), { width: 1440 }));
  await waitFor(() => byText("Coming up in this course"));
  const [left, right] = [...root.querySelectorAll<HTMLElement>("[data-page]")];
  expect([left.querySelector("h1")?.textContent, left.textContent!.includes("CSE 442"), left.textContent!.includes("Lecture Mon"), right.textContent!.includes("Coming up in this course")]).toEqual(["Software Engineering", true, true, true]);
  expect([right.getBoundingClientRect().left > left.getBoundingClientRect().right, root.querySelector("[data-spine]") !== null]).toEqual([true, true]);
  root = wide(mount(ui("/courses/c1"), { width: 375 }));
  await waitFor(() => byText("Coming up in this course"));
  const [a, b] = [...root.querySelectorAll<HTMLElement>("[data-page]")];
  expect([b.getBoundingClientRect().top >= a.getBoundingClientRect().bottom - 1, pageScrollWidth() <= 375]).toEqual([true, true]);
});
await test("5. Lectures are not listed newest first, or Coming up leaves out the chips or lists every class meeting", COURSE, async () => {
  stubApi(routes());
  const root = mount(ui("/courses/c1"));
  await waitFor(() => byText("Coming up in this course"));
  const fmt = (n: number) => new Date(`${day(n)}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  await waitFor(() => byText(fmt(-9)));
  const dates = [...root.querySelectorAll("section h2")].map((h) => h.textContent).filter((t) => t === fmt(-2) || t === fmt(-9));
  expect(dates).toEqual([fmt(-2), fmt(-9)]);
  const coming = root.querySelector('section[aria-labelledby="coming-up-course"]')!;
  const links = [...coming.querySelectorAll("a")];
  expect(links.map((a) => a.querySelector("strong")!.textContent)).toEqual(["Homework 3", "Midterm exam"]);
  expect(links.map((a) => a.querySelector("[data-tone]")!.textContent)).toEqual(["Today", "In 9 days"]);
  expect(links[0].querySelector("[data-tone]")!.getAttribute("data-tone")).toBe("due");
});
await test("6. Start a note does not create a note for today's lecture on this course", COURSE, async () => {
  const api = stubApi(routes({ "note-create": (req: { body: Record<string, unknown> }) => ({ note: { ...note("n9", "c1", day(0)), ...req.body } }), note: { note: note("n9", "c1", day(0)) } }));
  const root = mount(ui("/courses/c1"));
  await waitFor(() => inMain(root, "Start a note"));
  await click(inMain(root, "Start a note"));
  const sent = await waitFor(() => api.sent.find((r) => r.route === "note-create"));
  expect([(sent.body as { courseId?: string }).courseId, (sent.body as { lectureDate?: string }).lectureDate]).toEqual(["c1", day(0)]);
});
await test("7. The upload dropzone is not a dashed calm sheet, or the review step loses its ruled list and grouped section question", "src/features/imports.tsx → ImportDialog, src/features/imports.module.css", async () => {
  const lab = (section: string, d: number) => ({ title: "Lab", kind: "lab", section, days: [d], time: "14:00", location: "", firstDate: day(-30), lastDate: day(60), source: "Lab " + section });
  const read = { id: "j1", isSyllabus: true, noClassDates: [], meetings: [{ ...lab("", 2), title: "Lecture", kind: "lecture" }], events: [{ title: "Lab exam", kind: "exam", date: "", rangeStart: day(5), rangeEnd: day(11), meeting: "lab", source: "Lab exam" }, { title: "Homework 1", kind: "assignment", date: day(3), time: "23:59", location: "", source: "HW1" }] };
  stubApi(routes({ "syllabus-upload": { job: { id: "j1" } }, "import-extract": { job: read }, "import-confirm": { created: 3, skipped: 0 } }));
  const root = mount(ui("/courses"));
  await waitFor(() => cards(root).length === 3);
  await click(inMain(root, "Upload syllabus"));
  const dialog = await waitFor(() => byRole("dialog", "Your semester, sorted"));
  const zone = dialog.querySelector("label:has(input[type=file])")!;
  expect(win(zone).getComputedStyle(zone).borderTopStyle).toBe("dashed");
  const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File(["CSE 442 syllabus"], "syllabus.txt", { type: "text/plain" })], configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  const next = await waitFor(() => [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Continue" && !b.disabled), 15000);
  await click(next);
  await waitFor(() => [...dialog.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add to schedule"), 15000);
  const sets = [...dialog.querySelectorAll("fieldset")];
  const items = sets.filter((f) => f.querySelector("legend")?.textContent?.startsWith("Detected"));
  const question = sets.find((f) => f.querySelector("legend")?.textContent === "Which section is yours?");
  const ruled = (f: Element) => [win(f).getComputedStyle(f).borderBottomWidth, win(f).getComputedStyle(f).borderTopWidth];
  expect([items.length >= 3, question !== undefined, items.every((f) => ruled(f).join() === "1px,0px")]).toEqual([true, true, true]);
  expect(win(question!).getComputedStyle(question!).backgroundColor !== win(dialog).getComputedStyle(dialog).backgroundColor).toBe(true);
  expect(dialog.scrollWidth <= dialog.clientWidth).toBe(true);
});
await test("8. The Courses page or a course page scrolls sideways on a 320 px phone", COURSE + ", " + LIST, async () => {
  const long = { ...cse442, name: "Software Engineering and Long Names".padEnd(60, "x"), code: "CSE 442".padEnd(40, "W") };
  stubApi(routes({ courses: { courses: [long, cse250] } }));
  let root = mount(ui("/courses"), { width: 320 });
  await waitFor(() => cards(root).length === 2);
  expect(pageScrollWidth() <= 320).toBe(true);
  root = mount(ui("/courses/c1"), { width: 320 });
  await waitFor(() => byText("Coming up in this course"));
  expect(pageScrollWidth() <= 320).toBe(true);
});
await test("9. Course text is under 4.5:1 on the sheet in a dark scheme or a custom theme", "src/features/courses.module.css, src/features/course-page.module.css (colors only through variables)", async () => {
  stubApi(routes());
  const root = mount(ui("/courses"));
  await waitFor(() => cards(root).length === 3);
  const html = document.documentElement;
  const low: string[] = [];
  const check = (label: string) => {
    for (const card of cards(root)) for (const n of card.querySelectorAll<HTMLElement>("strong, span")) {
      if (n.children.length || !n.textContent) continue;
      const r = contrastRatio(hex(win(n).getComputedStyle(n).color), hex(win(card).getComputedStyle(card).backgroundColor));
      if (r < 4.5) low.push(`${label} ${n.textContent} ${r.toFixed(2)}`);
    }
  };
  try {
    for (const [scheme, theme] of [["fjord", "dark"], ["mocha", "dark"], ["rose", "light"]]) { html.dataset.scheme = scheme; html.dataset.theme = theme; check(`${scheme} ${theme}`); }
    const p = buildPalette({ accent: "#e11d48", background: "#3fa7d6", text: "#ffffff" }).light;
    for (const [k, v] of Object.entries(p)) html.style.setProperty(k, String(v));
    check("custom");
  } finally {
    delete html.dataset.scheme; delete html.dataset.theme; html.removeAttribute("style");
  }
  expect(low).toEqual([]);
});
