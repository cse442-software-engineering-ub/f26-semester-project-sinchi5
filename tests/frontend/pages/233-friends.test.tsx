// Frontend test: the real Friends page inside the real app, with the API replaced. Every request must be scripted.
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

page({ card: "233", title: "Frontend: Friends page on the new design", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const signedIn = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
type P = { id: string; userId: string; name: string; email: string };
const p = (id: string, name: string, email = `${id}@example.edu`): P => ({ id: "f" + id, userId: id, name, email });
const lists = (friends: P[] = [], incoming: P[] = [], outgoing: P[] = []) => ({ friends, incoming, outgoing });
const FILE = "src/features/friends.tsx → Friends";
const routes = (extra: Record<string, unknown> = {}) => ({
  session: signedIn, notes: { notes: [] }, events: { events: [] }, courses: { courses: [] }, "course-notes-shares": { shares: [] },
  "shared-notes": { notes: [] }, friends: lists(), ...extra,
});
const at = () => <MemoryRouter initialEntries={["/friends"]}><Provider><App /></Provider></MemoryRouter>;
const two = [p("2", "Grace Hopper"), p("3", "Alan Turing")];
const left = (el: Element | null | undefined) => Math.round(el?.getBoundingClientRect().left ?? -1);
const sectionOf = (name: string) => byRole("heading", name)?.closest("section") ?? null;
const inSection = (name: string, text: string) => (sectionOf(name)?.textContent ?? "").includes(text);

await test("1. Friends, requests for you and sent requests land in the wrong section, or are missing", FILE, async () => {
  stubApi(routes({ friends: lists(two, [p("6", "Katherine Johnson")], [p("7", "Margaret Hamilton")]) }));
  mount(at());
  await waitFor(() => byText("Grace Hopper"));
  expect(inSection("Your friends", "Grace Hopper") && inSection("Your friends", "Alan Turing")).toBe(true);
  expect(inSection("Requests for you", "Katherine Johnson")).toBe(true);
  expect(inSection("Sent requests", "Margaret Hamilton") && inSection("Sent requests", "Pending")).toBe(true);
  expect(inSection("Your friends", "Katherine Johnson")).toBe(false);
});
await test("2. Send request does not post the trimmed email to friend-request, or the screen does not say Request sent.", FILE, async () => {
  const api = stubApi(routes({ "friend-request": lists([], [], [p("8", "New Person", "new@example.edu")]) }));
  mount(at());
  await type(await waitFor(() => byLabel("Classmate's email")), "  new@example.edu ");
  await click(byRole("button", "Send request"));
  await waitFor(() => byText("Request sent."));
  const sent = api.sent.find((r) => r.route === "friend-request");
  expect(sent?.method).toBe("POST");
  expect(sent?.body).toEqual({ email: "new@example.edu" });
  expect(inSection("Sent requests", "New Person")).toBe(true);
});
await test("3. Accept or Decline posts the wrong id or choice, or the request stays on screen", FILE, async () => {
  const api = stubApi(routes({
    friends: lists([], [p("6", "Katherine Johnson"), p("9", "Dorothy Vaughan")]),
    "friend-respond": (req: { body: { accept: boolean } }) => req.body.accept ? lists([p("6", "Katherine Johnson")], [p("9", "Dorothy Vaughan")]) : lists([p("6", "Katherine Johnson")]),
  }));
  mount(at());
  await click(await waitFor(() => byRole("button", "Accept Katherine Johnson")));
  await waitFor(() => inSection("Your friends", "Katherine Johnson"));
  expect(api.sent.find((r) => r.route === "friend-respond")?.body).toEqual({ id: "f6", accept: true });
  await click(byRole("button", "Decline Dorothy Vaughan"));
  await waitFor(() => byText("Dorothy Vaughan") === null);
  expect(api.sent.filter((r) => r.route === "friend-respond")[1].body).toEqual({ id: "f9", accept: false });
});
await test("4. Remove skips the confirmation, posts the wrong friend, or leaves the friend on screen", FILE, async () => {
  const api = stubApi(routes({ friends: lists(two), "friend-remove": lists([two[1]]) }));
  mount(at());
  await click(await waitFor(() => byRole("button", "Remove Grace Hopper")));
  await waitFor(() => byText("Remove Grace Hopper from your friends?"));
  expect(api.sent.some((r) => r.route === "friend-remove")).toBe(false);
  await click(byRole("button", "Remove friend"));
  await waitFor(() => byText("Grace Hopper") === null);
  expect(api.sent.find((r) => r.route === "friend-remove")?.body).toEqual({ id: "f2" });
  expect(inSection("Your friends", "Alan Turing")).toBe(true);
});
await test("5. An API error is not shown under the email box, or a failed list load shows nothing", FILE, async () => {
  stubApi(routes({ "friend-request": { status: 404, body: { error: "No student has that email." } } }));
  mount(at());
  await type(await waitFor(() => byLabel("Classmate's email")), "nobody@example.edu");
  await click(byRole("button", "Send request"));
  await waitFor(() => byText("No student has that email."));
  expect(byText("Request sent.") === null).toBe(true);
  stubApi(routes({ friends: { status: 500, body: { error: "Your friends list is unavailable." } } }));
  mount(at());
  await waitFor(() => byRole("alert"));
  expect((byRole("alert")?.textContent ?? "").includes("unavailable")).toBe(true);
});
await test("6. An account with no friends or requests shows empty sections instead of a friendly message", FILE, async () => {
  stubApi(routes());
  mount(at());
  await waitFor(() => byText("No friends yet. Add a classmate by email."));
  expect(inSection("Requests for you", "No requests waiting for you.")).toBe(true);
  expect(inSection("Sent requests", "You have no pending requests.")).toBe(true);
});
await test("7. The Friends page scrolls sideways on a 320 px phone or a 1920 px monitor, with very long names", "src/features/friends.module.css", async () => {
  const long = (n: string) => p(n, "N".repeat(70), "e".repeat(90) + "@example.edu");
  const data = routes({ friends: lists([long("2"), long("3")], [long("4")], [long("5")]) });
  for (const width of [320, 1920]) {
    stubApi(data);
    const root = mount(at(), { width });
    await waitFor(() => byRole("heading", "Your friends"));
    expect(pageScrollWidth() <= width).toBe(true);
    expect(root.ownerDocument.querySelector("main")!.scrollWidth <= width).toBe(true);
  }
});
await test("8. On a 1920 px screen the friend cards stay in one narrow column, or on a 375 px phone they sit in more than one", "src/features/friends.module.css (.friendGrid, container queries)", async () => {
  const many = Array.from({ length: 8 }, (_, i) => p(String(20 + i), "Friend " + i));
  stubApi(routes({ friends: lists(many, [p("6", "Katherine Johnson")]) }));
  let root = mount(at(), { width: 1920 });
  await waitFor(() => byText("Friend 7"));
  let doc = root.ownerDocument;
  doc.body.style.cssText = "margin:0;padding:0;max-width:none"; // the runner page's reading column is not part of the app
  const cards = (d: Document) => [...d.querySelectorAll('section[aria-labelledby="friend-list-heading"] li')];
  expect(new Set(cards(doc).map(left)).size >= 3).toBe(true);
  // the add form and the requests sit beside the grid, not above it
  expect(left(doc.querySelector("#friend-email")) < left(cards(doc)[0])).toBe(true);
  stubApi(routes({ friends: lists(many) }));
  root = mount(at(), { width: 375 });
  await waitFor(() => byText("Friend 7"));
  doc = root.ownerDocument;
  expect(new Set(cards(doc).map(left)).size).toBe(1);
  const tooSmall = [...doc.querySelectorAll("main button")].filter((b) => b.getBoundingClientRect().height < 44).length;
  expect(tooSmall).toBe(0);
});
