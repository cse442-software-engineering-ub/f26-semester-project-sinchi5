// Frontend test: every dialog built on the shared Modal keeps Tab inside it; the real App shell (Skip link, sidebar) is mounted behind it.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, click, waitFor } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";

page({ card: "259", title: "Frontend: Keyboard focus stays inside dialogs", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const routes = { session: { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "t" }, notes: { notes: [] }, events: { events: [] },
  courses: { courses: [] }, "course-notes-shares": { shares: [] } };
const SRC = "src/shared/ui.tsx → Modal";
const ui = (path: string) => <MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>;
const dialog = () => document.querySelector<HTMLElement>("[role=dialog]");
const inDialog = () => !!dialog()?.contains(document.activeElement);

// shortcut: a script cannot press the real Tab key, so this sends the keydown and, when the page does not cancel it, moves to
// the next tabbable element in document order that is not inert, as the browser would. Real Tab was checked in Chromium by hand.
function tab(shift: boolean) {
  const from = document.activeElement as HTMLElement;
  const down = new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true });
  if (!from.dispatchEvent(down)) return;
  const stops = [...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")]
    .filter((e) => e.tabIndex >= 0 && !e.closest("[inert], #report") && !(e as HTMLInputElement).disabled && e.getClientRects().length > 0);
  const at = stops.indexOf(from);
  stops[(at + (shift ? -1 : 1) + stops.length) % stops.length]?.focus();
}
async function stays(open: () => Promise<HTMLElement>) {
  await open();
  await waitFor(() => dialog());
  await waitFor(inDialog);
  for (const shift of [false, true]) {
    for (let i = 0; i < 40; i++) { tab(shift); expect(inDialog()).toBe(true); }
  }
}
async function escapes(open: () => Promise<HTMLElement>) {
  const button = await open();
  await waitFor(() => dialog());
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await waitFor(() => !dialog(), 4000);
  await waitFor(() => document.activeElement === button);
}
const addEvent = async () => { stubApi(routes); mount(ui("/schedule?date=2026-11-24")); const b = await waitFor(() => byRole("button", /Add event/)); b.focus(); await click(b); return b; };
const upload = async () => { stubApi(routes); mount(ui("/courses")); const b = await waitFor(() => [...document.querySelectorAll<HTMLElement>("main button")].find((x) => x.textContent?.trim() === "Upload syllabus")); b.focus(); await click(b); return b; };
const addCourse = async () => { stubApi(routes); mount(ui("/courses")); const b = await waitFor(() => [...document.querySelectorAll<HTMLElement>("main button")].find((x) => x.textContent?.trim() === "Add course")); b.focus(); await click(b); return b; };

await test("1. Tab and Shift+Tab stay inside the event dialog", SRC, () => stays(addEvent));
await test("2. Tab and Shift+Tab stay inside the Upload syllabus dialog", SRC, () => stays(upload));
await test("3. Tab and Shift+Tab stay inside the Add course dialog", SRC, () => stays(addCourse));
await test("4. Escape closes the event dialog and focus returns to the button that opened it", SRC, () => escapes(addEvent));
await test("5. Escape closes the Upload syllabus dialog and focus returns to the button that opened it", SRC, () => escapes(upload));
await test("6. Escape closes the Add course dialog and focus returns to the button that opened it", SRC, () => escapes(addCourse));
await test("7. The page behind an open dialog is inert, and is live again after it closes", SRC, async () => {
  const b = await addEvent();
  await waitFor(() => dialog());
  expect(b.closest("[inert]") !== null).toBe(true);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await waitFor(() => !dialog(), 4000);
  expect(b.closest("[inert]") === null).toBe(true);
});
