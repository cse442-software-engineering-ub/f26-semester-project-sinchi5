// Frontend test: the real syllabus review screen with the extract and confirm routes replaced. No syllabus is sent to the reader.
import "@fontsource-variable/inter";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byText, click, type, waitFor } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";

page({ card: "235", title: "Frontend: Syllabus review asks for my section and places week items on that day", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const signedIn = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const cse442 = { id: "c1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026", classesStart: "2026-08-24", classesEnd: "2026-12-04" };
const PAGE = "src/features/imports.tsx → ImportDialog, src/services/syllabus.ts → sectionQuestions / applyPlacement";

const span = { classes: { firstDate: "2026-08-24", lastDate: "2026-12-04" } };
const lecture = { title: "Lecture", kind: "lecture", section: "", days: [1, 3, 5], time: "10:00", location: "", ...span.classes, source: "MWF 10:00" };
const lab = (section: string, day: number, time: string) => ({ title: "Lab", kind: "lab", section, days: [day], time, location: "", ...span.classes, source: `Lab ${section}` });
const homework = { title: "Homework 1", kind: "assignment", date: "2026-09-10", time: "23:59", location: "", source: "HW1 due Sep 10" };
const midterm = { title: "Midterm exam", kind: "exam", date: "2026-10-14", time: "10:00", location: "", source: "Midterm Oct 14" };
const project = { title: "Project deadline", kind: "deadline", date: "2026-11-20", time: "", location: "", source: "Project due Nov 20" };
const labExam = { title: "Lab exam", kind: "exam", date: "", rangeStart: "2026-10-12", rangeEnd: "2026-10-18", meeting: "lab", source: "Lab exam, week of Oct 12" };

const withSections = { meetings: [lecture, lab("Section A", 2, "14:00"), lab("Section B", 4, "09:00")], events: [homework, midterm, labExam, project] };
const noSections = { meetings: [lecture], events: [homework, midterm, labExam, project] };
const exactOnly = { meetings: [lecture], events: [homework, midterm, project] };
type Read = { meetings: object[]; events: object[] };

const routes = (read: Read, extra: Record<string, unknown> = {}) => ({
  session: signedIn, notes: { notes: [] }, events: { events: [] }, courses: { courses: [cse442] }, "course-notes-shares": { shares: [] },
  "syllabus-upload": { job: { id: "j1" } },
  "import-extract": { job: { id: "j1", isSyllabus: true, noClassDates: [], ...read } },
  "import-confirm": { created: 4, skipped: 0 },
  ...extra,
});
const ui = (path: string) => <MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>;
const inMain = (root: Element, name: string) => [...root.querySelectorAll<HTMLElement>("main button")].find((b) => (b.textContent ?? "").trim() === name) ?? null;

// Opens the course page's Upload syllabus window, chooses a text file and reads it down to the review screen.
async function review(read: Read, opts: { width?: number; extra?: Record<string, unknown> } = {}) {
  const api = stubApi(routes(read, opts.extra));
  const root = mount(ui("/courses"), { width: opts.width });
  await waitFor(() => root.querySelector('main a[href="/courses/c1"]'), 15000);
  await click(inMain(root, "Upload syllabus"));
  const dialog = await waitFor(() => byRole("dialog", "Your semester, sorted"), 15000);
  const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File(["CSE 442 syllabus"], "syllabus.txt", { type: "text/plain" })], configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  const next = await waitFor(() => [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Continue" && !b.disabled), 15000);
  await click(next);
  await waitFor(() => [...dialog.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add to schedule"), 15000);
  return { api, dialog };
}
// A label's own words, without the options of the select it wraps.
const words = (e: HTMLInputElement) => {
  const copy = e.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
  copy?.querySelectorAll("select").forEach((s) => s.remove());
  return (copy?.textContent ?? "").replace(/\s+/g, " ").trim();
};
const field = (dialog: HTMLElement, label: string) => [...dialog.querySelectorAll<HTMLInputElement>("input, select")].find((e) => words(e) === label) ?? null;
// The review row (fieldset) whose Event title is `title`.
const row = (dialog: HTMLElement, title: string) =>
  [...dialog.querySelectorAll("fieldset")].find((f) => [...f.querySelectorAll("input")].some((i) => i.value === title && i.id.startsWith("event-title"))) as HTMLElement;
const val = (dialog: HTMLElement, title: string, label: string) =>
  [...row(dialog, title).querySelectorAll<HTMLInputElement>("input")].find((i) => (i.labels?.[0]?.textContent ?? "").startsWith(label))!.value;
async function choose(el: HTMLElement | null, value: string) {
  const select = el as unknown as HTMLSelectElement;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
}
const optionTexts = (select: HTMLElement | null) => [...(select?.querySelectorAll("option") ?? [])].map((o) => o.textContent);

await test("1. A syllabus with only exact dates gets a new question, or looks different from before", PAGE, async () => {
  const { dialog } = await review(exactOnly);
  expect(byText("Which section is yours?") === null).toBe(true);
  expect([...dialog.querySelectorAll("select")].some((s) => /^Your /.test(s.labels?.[0]?.textContent ?? ""))).toBe(false);
  expect(val(dialog, "Midterm exam", "Due date")).toBe("2026-10-14");
});
// Ticks or unticks the existing "Include Lab <name>" box: the student's section.
async function pick(dialog: HTMLElement, name: string) {
  await click([...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((i) => words(i).startsWith(`Include Lab ${name}`)) ?? null);
}
await test("2. A lab with two posted sections asks for the section a second time, or does not explain why picking one matters", PAGE, async () => {
  const { dialog } = await review(withSections);
  expect(byText("Pick your lab section") !== null).toBe(true);
  expect((dialog.textContent ?? "").includes("Tick your section and we’ll put it on that day")).toBe(true);
  // The existing pick is the only control: no second question, and the one lecture is known.
  expect(byText("Which section is yours?") === null && field(dialog, "Your lab day") === null).toBe(true);
  expect([...dialog.querySelectorAll("select")].some((s) => /^Your /.test(s.labels?.[0]?.textContent ?? ""))).toBe(false);
});
await test("3. Choosing a section leaves the lab exam on Sunday, or does not move it as the choice changes, or shows no reason", PAGE, async () => {
  const { dialog } = await review(withSections);
  await pick(dialog, "Section B");
  expect(val(dialog, "Lab exam", "Due date")).toBe("2026-10-15");
  expect(val(dialog, "Lab exam", "Time")).toBe("09:00");
  expect((row(dialog, "Lab exam").textContent ?? "").includes("Date worked out from October 12–18")).toBe(true);
  await pick(dialog, "Section B");
  await pick(dialog, "Section A");
  expect(val(dialog, "Lab exam", "Due date")).toBe("2026-10-13");
  expect(val(dialog, "Lab exam", "Time")).toBe("14:00");
});
await test("4. Not sure changes the lab exam from the end of its week, or leaves it unchecked or unlabelled", PAGE, async () => {
  const { dialog } = await review(withSections);
  expect(val(dialog, "Lab exam", "Due date")).toBe("2026-10-18");
  expect(val(dialog, "Lab exam", "Time")).toBe("23:59");
  await pick(dialog, "Section B");
  await pick(dialog, "Section B");
  expect(val(dialog, "Lab exam", "Due date")).toBe("2026-10-18");
  // Both sections ticked is also "not sure".
  await pick(dialog, "Section A");
  await pick(dialog, "Section B");
  expect(val(dialog, "Lab exam", "Due date")).toBe("2026-10-18");
  expect(row(dialog, "Lab exam").querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
});
await test("5. A syllabus with no posted lab sections does not ask for a day, or does not offer a time once a day is chosen", PAGE, async () => {
  const { dialog } = await review(noSections);
  expect(field(dialog, "Your lab section") === null).toBe(true);
  expect(optionTexts(field(dialog, "Your lab day"))).toEqual(["Not sure", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
  expect(field(dialog, "Your lab time (optional)") === null).toBe(true);
  await choose(field(dialog, "Your lab day"), "d3");
  expect(val(dialog, "Lab exam", "Due date")).toBe("2026-10-14");
  expect(field(dialog, "Your lab time (optional)") !== null).toBe(true);
});
await test("6. Exact-date items move when a section is chosen, or show a placed hint", PAGE, async () => {
  const { dialog } = await review(withSections);
  await pick(dialog, "Section B");
  for (const [title, date] of [["Homework 1", "2026-09-10"], ["Midterm exam", "2026-10-14"], ["Project deadline", "2026-11-20"]]) {
    expect(val(dialog, title, "Due date")).toBe(date);
    expect((row(dialog, title).textContent ?? "").includes("Date worked out")).toBe(false);
  }
});
await test("7. Saving sends the lab exam on the section's day, or changes the shape of an event", PAGE, async () => {
  const { api, dialog } = await review(withSections);
  await pick(dialog, "Section B");
  await click([...dialog.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add to schedule") as HTMLElement);
  const sent = await waitFor(() => api.sent.find((r) => r.route === "import-confirm"));
  const exam = sent.body.events.find((e: { title: string }) => e.title === "Lab exam");
  expect(exam).toEqual({ title: "Lab exam", kind: "exam", date: "2026-10-15", time: "09:00", location: "" });
});
await test("8. Assignment and deadline items are left out of what is saved", PAGE, async () => {
  const { api, dialog } = await review(withSections);
  await click([...dialog.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Add to schedule") as HTMLElement);
  const sent = await waitFor(() => api.sent.find((r) => r.route === "import-confirm"));
  const kinds = Object.fromEntries(sent.body.events.filter((e: { series?: number }) => e.series === undefined).map((e: { title: string; kind: string }) => [e.title, e.kind]));
  expect(kinds["Homework 1"]).toBe("assignment");
  expect(kinds["Project deadline"]).toBe("deadline");
});
await test("9. A placed day the student edits by hand snaps back to the section day, or still shows its hint", PAGE, async () => {
  const { dialog } = await review(withSections);
  await pick(dialog, "Section B");
  await type([...row(dialog, "Lab exam").querySelectorAll<HTMLInputElement>("input")].find((i) => i.type === "date") ?? null, "2026-10-16");
  expect(val(dialog, "Lab exam", "Due date")).toBe("2026-10-16");
  expect((row(dialog, "Lab exam").textContent ?? "").includes("Date worked out")).toBe(false);
});
await test("10. The review screen with the section question scrolls sideways on a 320 px phone", "src/features/imports.module.css → .sectionQuestions, .placedHint", async () => {
  // The window opens outside the phone-sized frame (it is attached to the page), so the window itself is made 320 px wide.
  const { dialog } = await review(withSections);
  dialog.style.cssText += ";width:320px;max-width:320px";
  await new Promise((r) => setTimeout(r, 50));
  expect(dialog.scrollWidth <= dialog.clientWidth).toBe(true);
});
