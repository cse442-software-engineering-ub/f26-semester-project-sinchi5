// Frontend test: the real app, API replaced. A session that ended (401) or a signed-out visit to an app page lands on the log-in form with "Log in to continue."
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import "../../../src/features/onboarding.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect, hooks } from "../../shared/runner.js";
import { mount, stubApi, byRole, byText, byLabel, click, type, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";

page({ card: "258", title: "Frontend: Say Log in to continue when a session has ended", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const MESSAGE = "Log in to continue.";
const note = {
  id: "n1", ownerId: "1", courseId: "c1", title: "Week 3", body: "<p>Hello</p>", format: "html", excerpt: "", lectureDate: "2026-09-01",
  category: "School", tags: [], pinned: false, visibility: "shared", createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-01T12:00:00Z", remindAt: null,
};
const FLOW = "src/app/App.tsx → App (signed-out Navigate), src/features/onboarding.tsx → Onboarding (loginRequired)";

// Captures the Provider's 30-second re-read so a case can fire it at once.
const realSetInterval = window.setInterval;
const noTimer = () => { throw new Error("The 30 s timer was never set"); };
let fire: () => void = noTimer;
window.setInterval = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) => {
  if (ms === 30000 && typeof fn === "function") fire = () => (fn as () => void)();
  return realSetInterval(fn, ms, ...(rest as []));
}) as typeof window.setInterval;
hooks.after.push(() => { fire = noTimer; });

// A server that remembers who is signed in. `expire()` ends the session; the next call to a note route answers 401.
function server(signedIn: boolean) {
  let user: typeof ada | null = signedIn ? ada : null;
  const session = () => ({ user, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" });
  const gated = (answer: unknown) => () => (user ? answer : { status: 401, body: { error: "Sign in to continue." } });
  const api = stubApi({
    session: () => session(),
    login: () => { user = ada; return session(); },
    logout: () => { user = null; return session(); },
    notes: { notes: [note] }, events: { events: [] }, courses: { courses: [] }, "course-notes-shares": { shares: [] }, "shared-notes": { notes: [] },
    friends: { friends: [], incoming: [], outgoing: [] }, note: { note }, "note-versions": { versions: [] }, "note-collaborators": { collaborators: [] },
    "note-comments": { comments: [] }, "note-pin": gated({ note: { ...note, pinned: true } }),
  });
  return { api, expire: () => { user = null; } };
}
const at = (path: string) => <MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>;
const loginForm = () => byRole("heading", "Good to see you again.");
const message = () => byText(MESSAGE);
const greeting = () => byRole("heading", /^Good (morning|afternoon|evening)/);
const settle = () => new Promise((r) => setTimeout(r, 150));

await test("1. A 401 from a call during use does not land on the log-in form with the message", FLOW + ", src/services/notes-http.ts → createApiClient", async () => {
  const s = server(true);
  mount(at("/notes/n1"));
  const pin = await waitFor(() => byRole("button", "Pin note"));
  s.expire();
  await click(pin);
  await waitFor(loginForm);
  expect(message() !== null).toBe(true);
});
await test("2. A session that ended while the tab sat open is not noticed by the 30 s re-read, or shows no message", FLOW + ", src/app/context.tsx → recheck", async () => {
  const s = server(true);
  mount(at("/"));
  await waitFor(greeting);
  s.expire();
  fire();
  await waitFor(loginForm);
  expect(message() !== null).toBe(true);
});
await test("3. Opening /notes signed out does not show the log-in form with the message", FLOW, async () => {
  server(false);
  mount(at("/notes"));
  await waitFor(loginForm);
  expect([message() !== null, byLabel("Email address") !== null]).toEqual([true, true]);
});
await test("4. A normal first visit to / shows the message", FLOW, async () => {
  server(false);
  mount(at("/"));
  await waitFor(loginForm);
  await settle();
  expect(message()).toBe(null);
});
await test("5. Log out shows the message", FLOW + " (signOut)", async () => {
  server(true);
  mount(at("/"));
  await click(await waitFor(() => byRole("button", "Ada Lovelace")));
  await new Promise((r) => setTimeout(r, 400)); // the menu ignores a click that lands the moment it opens
  await click(await waitFor(() => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((i) => i.textContent === "Log out") ?? null));
  await waitFor(loginForm);
  await settle();
  expect(message()).toBe(null);
});
await test("6. The message is not announced to a screen reader (role status)", "src/features/onboarding.tsx → Onboarding (loginRequired)", async () => {
  server(false);
  mount(at("/notes"));
  await waitFor(loginForm);
  expect(byRole("status", MESSAGE) !== null).toBe(true);
});
await test("7. Logging in does not remove the message, or does not open the app", FLOW, async () => {
  server(false);
  mount(at("/notes"));
  await type(await waitFor(() => byLabel("Email address")), "ada@example.edu");
  await type(byLabel("Password"), "TestPassword2026!");
  await click(byRole("button", "Log in"));
  await waitFor(greeting);
  expect(message()).toBe(null);
});
await test("8. Older wording (Sign in to continue, session has ended, Please log in) is still in the app's source", "src/** (any user-facing text)", async () => {
  const files = import.meta.glob("../../../src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const old = /sign in to continue|session has ended|session expired|please (log|sign) in/i;
  expect(Object.entries(files).filter(([, text]) => old.test(text)).map(([name]) => name)).toEqual([]);
});
await test("9. At 320 px the message makes the page scroll sideways", "src/features/onboarding.module.css", async () => {
  server(false);
  mount(at("/notes"), { width: 320 });
  await waitFor(() => message());
  expect(pageScrollWidth() <= 320).toBe(true);
});
