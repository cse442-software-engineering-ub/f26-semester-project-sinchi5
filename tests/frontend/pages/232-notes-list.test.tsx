// Frontend test: the real Notes page (inside the app shell) with the API replaced. Every request must be scripted.
import "@fontsource-variable/inter";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byLabel, byText, click, type, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";

page({ card: "232", title: "Frontend: Notes list on the new design", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const signedIn = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const cse442 = { id: "c1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const cse250 = { id: "c2", code: "CSE 250", name: "Data Structures", color: "#7A8D9D", term: "Fall 2026" };
const note = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, ownerId: "1", courseId: "c1", title, body: `Body of ${title}`, lectureDate: "2026-09-01", category: "School", tags: [],
  pinned: false, visibility: "private", createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-01T12:00:00Z", ...extra,
});
const PAGE = "src/features/notes-list.tsx → Notes";
const routes = (notes: object[] | (() => unknown) = [], extra: Record<string, unknown> = {}) => ({
  session: signedIn, notes: typeof notes === "function" ? notes : { notes }, events: { events: [] }, courses: { courses: [cse442, cse250] },
  "course-notes-shares": { shares: [] }, "shared-notes": { notes: [] }, ...extra,
});
const ui = (path = "/notes") => <MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>;
// Records every request URL (the harness keeps only the route name), so a filter sent as a query parameter can be seen.
const urls = () => {
  const seen: string[] = [];
  const inner = window.fetch;
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => { seen.push(String(input)); return inner(input, init); }) as typeof fetch;
  return seen;
};
const choose = (select: HTMLSelectElement | null, value: string) => {
  select!.value = value;
  select!.dispatchEvent(new Event("change", { bubbles: true }));
  return new Promise((r) => setTimeout(r, 0));
};
// The harness copies the runner's stylesheet into the sized frame, which caps the body at 60rem; the app must see the whole width.
const fullWidth = (root: HTMLElement) => { Object.assign(root.ownerDocument.body.style, { maxWidth: "none", padding: "0" }); return root; };
const titles = (root: Element) => [...root.querySelectorAll("main h3")].map((h) => h.textContent);

await test("1. The count line is wrong: not '0 notes', '1 note' or '2 notes' in your space", PAGE, async () => {
  for (const [list, want] of [[[], "0 notes in your space"], [[note("n1", "Alpha")], "1 note in your space"], [[note("n1", "Alpha"), note("n2", "Beta")], "2 notes in your space"]] as const) {
    stubApi(routes([...list]));
    mount(ui());
    await waitFor(() => byText(want));
  }
});
await test("2. An empty account shows no next step: the empty state or its New note button is missing", PAGE, async () => {
  const fresh = note("n9", "Untitled note");
  stubApi(routes([], { "note-create": { note: fresh }, note: { note: fresh }, "note-versions": { versions: [] }, "note-collaborators": { collaborators: [] }, "note-comments": { comments: [] }, friends: { friends: [], incoming: [], outgoing: [] } }));
  const root = mount(ui());
  await waitFor(() => byRole("heading", "No notes found"));
  const button = [...root.querySelectorAll<HTMLElement>("main button")].find((b) => b.textContent?.trim() === "New note") ?? null;
  expect(button !== null).toBe(true);
  await click(button);
  await waitFor(() => byLabel("Note title"));
  expect(byRole("dialog")).toBe(null);
});
await test("3. A failing notes request is hidden: the page stays empty or loading instead of showing the error", PAGE, async () => {
  stubApi(routes(() => ({ status: 500, body: { error: "Your notes are unavailable. Please try again later." } })));
  mount(ui());
  await waitFor(() => byRole("alert", /unavailable/));
});
await test("4. Search shows notes that do not match, or a search with no results does not say so", PAGE, async () => {
  stubApi(routes([note("n1", "Algebra review"), note("n2", "Physics lab")]));
  const root = mount(ui());
  await waitFor(() => titles(root).length === 2);
  await type(byLabel("Search notes"), "alge");
  await waitFor(() => titles(root).length === 1);
  expect(titles(root)[0]).toBe("Algebra review");
  await type(byLabel("Search notes"), "zzzz");
  await waitFor(() => byRole("heading", "No notes found"));
  expect(byText(/Nothing matches/) !== null).toBe(true);
});
await test("5. Choosing a tag does not ask the server for that tag, or choosing a course still shows other courses' notes", PAGE, async () => {
  stubApi(routes(() => ({ notes: [note("n1", "Alpha", { tags: ["exam"] }), note("n2", "Beta", { courseId: "c2" })] })));
  const seen = urls();
  const root = mount(ui());
  await waitFor(() => titles(root).length === 2);
  await click(byRole("button", /^Filters/));
  await choose(byLabel("Course") as HTMLSelectElement, "c2");
  await waitFor(() => titles(root).length === 1);
  expect(titles(root)[0]).toBe("Beta");
  await choose(byLabel("Course") as HTMLSelectElement, "");
  await choose(byLabel("Tags") as HTMLSelectElement, "exam");
  await waitFor(() => seen.some((u) => /route=notes&.*tag=exam/.test(u)));
});
await test("6. Pinned notes are not first, or pinning sends no request or more than one", PAGE, async () => {
  const api = stubApi(routes([note("n1", "Pinned one", { pinned: true }), note("n2", "Plain two"), note("n3", "Plain three")], {
    "note-pin": (req: { body: { id: string; pinned: boolean } }) => ({ note: note(req.body.id, "x", { pinned: req.body.pinned }) }),
  }));
  const root = mount(ui());
  await waitFor(() => titles(root).length === 3);
  expect(titles(root)[0]).toBe("Pinned one");
  await click(byRole("button", "Pin Plain two"));
  await waitFor(() => api.sent.some((r) => r.route === "note-pin"));
  await new Promise((r) => setTimeout(r, 100));
  const pins = api.sent.filter((r) => r.route === "note-pin");
  expect(pins.length).toBe(1);
  expect(pins[0].body.pinned).toBe(true);
});
await test("7. The search, filters, sort, a card's link, Pin and Delete cannot be reached by keyboard or have no visible name", PAGE, async () => {
  stubApi(routes([note("n1", "Alpha")]));
  const root = mount(ui());
  await waitFor(() => titles(root).length === 1);
  const reachable = (el: HTMLElement | null) => el !== null && !(el as HTMLButtonElement).disabled && el.tabIndex >= 0;
  expect(reachable(byLabel("Search notes"))).toBe(true);
  expect(reachable(byRole("button", /^Filters/))).toBe(true);
  expect(reachable(byLabel("Sort notes"))).toBe(true);
  expect(reachable(byRole("button", "Pin Alpha"))).toBe(true);
  expect(reachable(byRole("button", "Delete Alpha"))).toBe(true);
  expect(reachable(root.querySelector('main a[href="/notes/n1"]'))).toBe(true);
  await click(byRole("button", /^Filters/));
  for (const name of ["Course", "Category", "Tags", "Visibility", "From", "To"]) expect(reachable(byLabel(name))).toBe(true);
});
await test("8. The page scrolls sideways at 320 px, or at 1920 px it has fewer than 4 columns or leaves more than 15% unused", "src/features/notes-list.module.css → .grid", async () => {
  const many = Array.from({ length: 12 }, (_, i) => note(`n${i}`, `Note ${i} ${"long title ".repeat(i % 3 ? 1 : 6)}`));
  stubApi(routes(many));
  fullWidth(mount(ui(), { width: 320 }));
  await waitFor(() => byText("12 notes in your space"));
  expect(pageScrollWidth() <= 320).toBe(true);
  stubApi(routes(many));
  const root = fullWidth(mount(ui(), { width: 1920 }));
  await waitFor(() => root.querySelectorAll("main h3").length === 12);
  const win = root.ownerDocument.defaultView!;
  const grid = root.querySelector("main h3")!.closest("div[class*=noteGrid]") as HTMLElement;
  const columns = win.getComputedStyle(grid).gridTemplateColumns.split(" ").length;
  const main = root.querySelector("main") as HTMLElement;
  const cs = win.getComputedStyle(main);
  const available = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  expect(columns >= 4).toBe(true);
  expect(grid.getBoundingClientRect().width >= available * 0.85).toBe(true);
});
