// Frontend test: Settings > Clear workspace with the API replaced. Every request must be scripted.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../../../src/app/App.module.css";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byLabel, click, type, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";

page({ card: "218", title: "Frontend: Clear the workspace once, with a busy state", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const session = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const routes = { session, notes: { notes: [] }, events: { events: [] }, courses: { courses: [] } };
const SET = "src/features/settings.tsx → Settings (the clear button)";
const ui = () => <MemoryRouter initialEntries={["/settings"]}><Provider><App /></Provider></MemoryRouter>;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const inDialog = (name: string) => [...dialog()!.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === name || b.getAttribute("aria-label") === name) ?? null;
const clears = (api: { sent: { route: string; body: any }[] }) => api.sent.filter((r) => r.route === "workspace-clear").map((r) => r.body);
const reads = (api: { sent: { route: string }[] }) => ["notes", "courses", "events"].map((n) => api.sent.filter((r) => r.route === n).length);
const escape = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Opens Settings and the "Start fresh?" window, optionally with CLEAR typed.
async function open(answers: Record<string, any>, typed = true) {
  const api = stubApi({ ...routes, ...answers });
  mount(ui());
  await click(await waitFor(() => byRole("button", "Clear workspace")));
  await waitFor(dialog);
  if (typed) await type(byLabel("Type CLEAR to confirm"), "CLEAR");
  return api;
}

await test("1. Clear workspace is enabled before CLEAR is typed exactly", SET + " (disabled)", async () => {
  await open({}, false);
  const states = [];
  for (const text of ["", "clear", "CLEA", "CLEAR"]) { await type(byLabel("Type CLEAR to confirm"), text); states.push(inDialog("Clear workspace")!.disabled); }
  expect(states).toEqual([true, true, true, false]);
});
await test("2. Clearing sends more or less than one workspace-clear {confirm: CLEAR}, or still deletes note by note", "src/services/app-repositories.ts → reset", async () => {
  const api = await open({ "workspace-clear": { cleared: true } });
  await click(inDialog("Clear workspace"));
  await waitFor(() => !dialog());
  expect(clears(api)).toEqual([{ confirm: "CLEAR" }]);
  expect(api.sent.filter((r) => /delete/.test(r.route)).length).toBe(0);
});
await test("3. A double click clears twice (bug 8)", SET + " (the clearing guard)", async () => {
  const api = await open({ "workspace-clear": { status: 200, body: { cleared: true }, delay: 300 } });
  const button = inDialog("Clear workspace")!;
  button.click(); button.click();
  await waitFor(() => !dialog());
  expect(clears(api).length).toBe(1);
});
await test("4. While clearing, the button is not disabled and \"Clearing…\", or Escape or the X closes the window", SET + " (busy), src/shared/ui.tsx → Modal (dismissible)", async () => {
  await open({ "workspace-clear": { status: 200, body: { cleared: true }, delay: 600 } });
  await click(inDialog("Clear workspace"));
  const button = inDialog("Clearing…");
  expect([!!button, button?.disabled, inDialog("Close")!.disabled]).toEqual([true, true, true]);
  escape();
  await wait(150);
  expect(!!dialog()).toBe(true);
  await waitFor(() => !dialog());
});
await test("5. After success the window stays open, or notes, courses and events are not read again", SET + " (refresh)", async () => {
  const api = await open({ "workspace-clear": { cleared: true } });
  const before = reads(api);
  await click(inDialog("Clear workspace"));
  await waitFor(() => !dialog());
  await waitFor(() => reads(api).every((n, i) => n > before[i]));
  expect(reads(api).every((n, i) => n > before[i])).toBe(true);
});
await test("6. A failed clear shows no message, a raw one, or closes the window; lists are not re-read", SET + " (catch, finally)", async () => {
  const api = await open({ "workspace-clear": { status: 422, body: { error: "Type CLEAR to confirm." } } });
  const before = reads(api);
  await click(inDialog("Clear workspace"));
  const alert = await waitFor(() => dialog()?.querySelector('[role="alert"]'));
  expect(alert.textContent).toBe("Type CLEAR to confirm.");
  expect([!!dialog(), byLabel("Type CLEAR to confirm")!.value, inDialog("Clear workspace")!.disabled]).toEqual([true, "CLEAR", false]);
  await waitFor(() => reads(api).every((n, i) => n > before[i]));
});
await test("7. The old error stays while a retry runs", SET + " (setError before the request)", async () => {
  let n = 0;
  await open({ "workspace-clear": () => (++n === 1 ? { status: 500, body: { error: "Your workspace could not be cleared. Please try again." } } : { status: 200, body: { cleared: true }, delay: 500 }) });
  await click(inDialog("Clear workspace"));
  await waitFor(() => dialog()?.querySelector('[role="alert"]'));
  await click(inDialog("Clear workspace"));
  expect(dialog()!.querySelector('[role="alert"]')).toBe(null);
  await waitFor(() => !dialog());
});
await test("8. The Settings page scrolls sideways at 320 px, with the window closed or open", "src/features/settings.tsx, src/app/App.module.css → .settingsGrid", async () => {
  stubApi({ ...routes });
  mount(ui(), { width: 320 });
  const frame = document.querySelector("iframe")!.contentDocument!;
  const clear = await waitFor(() => [...frame.querySelectorAll("button")].find((b) => b.textContent === "Clear workspace") as HTMLElement);
  const closed = pageScrollWidth() <= 320;
  await click(clear);
  await waitFor(dialog);
  expect([closed, pageScrollWidth() <= 320]).toEqual([true, true]);
});
