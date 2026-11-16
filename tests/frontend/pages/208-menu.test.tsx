// Frontend test: the real app shell (menu, New, account menu) with the API replaced. Every request must be scripted.
import "@fontsource-variable/inter";
import "../../../src/app/global.css";
// Load the shell styles up front so the phone-width iframe copies them.
import "../../../src/app/App.module.css";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byText, click, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";

page({ card: "208", title: "Frontend: One menu, account menu and New button", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const signedIn = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const signedOut = { user: null, onboarding: { completed: false, step: 0 }, csrfToken: "test-token" };
const SHELL = "src/app/App.tsx → App";
const MENU_CSS = "src/app/shell.module.css → .sidebar, .tabbar, .fab, .menu";

const ui = (path = "/") => <MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>;
const routes = { session: signedIn, notes: { notes: [] }, events: { events: [] }, courses: { courses: [] } };
const shown = (e: Element) => e.getClientRects().length > 0;
// Elements of the shell that are on the screen (the shell keeps a desktop and a phone copy and hides one with CSS).
const within = (root: ParentNode, sel: string) => [...root.querySelectorAll<HTMLElement>(sel)].filter(shown);
const labels = (els: Element[]) => els.map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim());
const button = (root: ParentNode, name: string) => within(root, "button").find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim() === name) ?? null;
// Menu popups render in a portal, so look in the screen's document and the page's.
const items = (root: Element) => labels([...new Set([root.ownerDocument, document])].flatMap((d) => [...d.querySelectorAll('[role="menuitem"]')]));
async function opened(root: Element, name: string) {
  await click(await waitFor(() => button(root, name)));
  await waitFor(() => items(root).length > 0);
}

await test("1. The menu is missing a link, or does not mark the page you are on", SHELL, async () => {
  stubApi(routes);
  const root = mount(ui("/"));
  const nav = await waitFor(() => within(root, 'nav[aria-label="Main navigation"]')[0]);
  expect(labels(within(nav, "a")).filter((l) => l !== "" && !/^CSE/.test(l))).toEqual(["Today", "Schedule", "Assignments", "Notes", "Courses", "Friends"]);
  const current = within(nav, 'a[aria-current="page"]');
  expect(labels(current)).toEqual(["Today"]);
});
await test("2. New does not list every way to start something", SHELL, async () => {
  stubApi(routes);
  const root = mount(ui("/"));
  await opened(root, "New");
  expect(items(root)).toEqual(["Note", "Event", "Course", "Upload syllabus", "Upload document", "Scan photos"]);
});
await test("3. The account menu lists more or less than Settings and Log out", SHELL, async () => {
  stubApi(routes);
  const root = mount(ui("/"));
  await opened(root, "Ada Lovelace");
  expect(items(root)).toEqual(["Settings", "Log out"]);
});
await test("4. Log out from Today sends no logout request, or lands on the welcome screen", "src/app/App.tsx → signOut and the signed-out redirect", async () => {
  let out = false;
  const api = stubApi({ ...routes, session: () => (out ? signedOut : signedIn), logout: () => { out = true; return signedOut; } });
  const root = mount(ui("/"));
  await opened(root, "Ada Lovelace");
  await new Promise((r) => setTimeout(r, 400)); // the menu ignores a click that lands the moment it opens
  await click(await waitFor(() => [...root.ownerDocument.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((i) => i.textContent === "Log out") ?? null));
  await waitFor(() => api.sent.some((r) => r.route === "logout"));
  expect(api.sent.filter((r) => r.route === "logout").length).toBe(1);
  await waitFor(() => byRole("heading", "Good to see you again."));
});
await test("5. A second search or Settings control is back in the shell", SHELL, async () => {
  stubApi(routes);
  const root = mount(ui("/"));
  await waitFor(() => within(root, "aside[class*=sidebar]").length > 0);
  expect(byText("Search your space") === null).toBe(true);
  expect(root.querySelectorAll('a[href="/settings"], a[aria-label="Search your space"]').length).toBe(0);
});
await test("6. On a phone the tab bar is missing, or More does not open Assignments and Friends", MENU_CSS, async () => {
  stubApi(routes);
  const root = mount(ui("/"), { width: 375 });
  const bar = await waitFor(() => within(root, 'nav[aria-label="Mobile navigation"]')[0]);
  expect(labels(within(bar, "a"))).toEqual(["Today", "Schedule", "Notes", "Courses"]);
  await waitFor(() => within(root, "aside[class*=sidebar]").length === 0);
  expect(within(root, "aside[class*=sidebar]").length).toBe(0);
  await opened(root, "More");
  expect(items(root)).toEqual(["Assignments", "Friends"]);
});
await test("7. The shell scrolls sideways on a 320 px phone", MENU_CSS, async () => {
  stubApi(routes);
  const root = mount(ui("/"), { width: 320 });
  await waitFor(() => within(root, 'nav[aria-label="Mobile navigation"]')[0]);
  expect(pageScrollWidth() <= 320).toBe(true);
});
await test("8. Courses has no heading, Add course button or empty state", "src/features/courses.tsx → Courses", async () => {
  stubApi(routes);
  const root = mount(ui("/courses"));
  await waitFor(() => byRole("heading", "Courses"));
  await waitFor(() => byText("No courses yet"));
  await click(button(root, "Add course"));
  await waitFor(() => byRole("dialog", "Add course"));
});
await test("9. A course does not appear as a card linking to its page", "src/features/courses.tsx → Courses", async () => {
  stubApi({ ...routes, courses: { courses: [{ id: "c1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" }] } });
  const root = mount(ui("/courses"));
  const card = await waitFor(() => root.querySelector('main a[href="/courses/c1"]'));
  expect((card.textContent ?? "").includes("CSE 442")).toBe(true);
});
