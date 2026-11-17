// Frontend test: real sign-up and log in screens inside the real app, API replaced. Every request must be scripted.
import "@fontsource-variable/inter";
import "../../../src/app/global.css";
// Load the screen styles up front so the phone-width iframe copies them.
import "../styles";
import "../../../src/app/shell.module.css";
import "../../../src/features/onboarding.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byText, byLabel, click, type, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import { RecoveryCode } from "../../../src/features/account";
import s from "../../../src/features/onboarding.module.css";
import App from "../../../src/app/App";

page({ card: "220", title: "Frontend: Send new accounts straight to the app after the recovery code", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const PASSWORD = "TestPassword2026!";
const CODE = "ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6789";
const FLOW = "src/features/onboarding.tsx → Onboarding (RecoveryCode onDone)";
const GONE = ["What are you learning?", "Let your syllabus do the work.", "Room to think.", "Let’s begin", "I’ll do this later", "Skip for now"];
const ui = (screen = <App />) => <MemoryRouter initialEntries={["/"]}><Provider>{screen}</Provider></MemoryRouter>;
const goneTexts = () => GONE.filter((t) => document.body.textContent?.includes(t));
const greeting = () => byRole("heading", /^Good (morning|afternoon|evening)/);
const onboardingRequests = (api: { sent: { route: string }[] }) => api.sent.filter((r) => r.route === "onboarding");
const continueButton = () => byRole("button", "Continue") as HTMLButtonElement;

// A server that remembers: signed out, then signed in with setup unfinished, then finished once /onboarding is sent.
function server(failOnboarding?: unknown) {
  let user: typeof ada | null = null;
  let completed = false;
  const session = () => ({ user, onboarding: { completed, step: completed ? 3 : 0 }, csrfToken: "test-token" });
  return stubApi({
    session: () => session(),
    register: () => { user = ada; return { ...session(), recoveryCode: CODE }; },
    login: () => { user = ada; return session(); },
    onboarding: () => { if (failOnboarding) return failOnboarding; completed = true; return session(); },
    "shared-notes": { notes: [] }, notes: { notes: [] }, events: { events: [] }, courses: { courses: [] },
  });
}
async function createAccount() {
  await click(await waitFor(() => byRole("button", "Create account")));
  await type(await waitFor(() => byLabel("Your name")), "Ada Lovelace");
  await type(byLabel("Email address"), "ada@example.edu");
  await type(byLabel("Password"), PASSWORD);
  await type(byLabel("Confirm password"), PASSWORD);
  await click(byRole("button", "Create account"));
  await waitFor(() => byRole("heading", "Save your recovery code"));
}
const saveCode = () => click(byLabel("I saved my recovery code"));

await test("1. After Continue on the recovery code screen the course step is still shown", FLOW, async () => {
  server();
  mount(ui());
  await createAccount();
  await saveCode();
  await click(continueButton());
  await waitFor(greeting);
  expect(byRole("heading", "What are you learning?")).toBe(null);
});
await test("2. Continue does not send exactly one onboarding request marking setup complete", "src/features/onboarding.tsx → Onboarding, src/services/auth.ts → completeOnboarding", async () => {
  const api = server();
  mount(ui());
  await createAccount();
  await saveCode();
  await click(continueButton());
  await waitFor(greeting);
  const sent = onboardingRequests(api);
  expect(sent.length).toBe(1);
  expect({ method: sent[0].method, body: sent[0].body, csrf: sent[0].csrf }).toEqual({ method: "POST", body: {}, csrf: "test-token" });
});
await test("3. Continue can be selected before \"I saved my recovery code\" is checked", "src/features/account.tsx → RecoveryCode", async () => {
  const api = server();
  mount(ui());
  await createAccount();
  expect(continueButton().disabled).toBe(true);
  await click(continueButton());
  expect(onboardingRequests(api).length).toBe(0);
  await saveCode();
  expect(continueButton().disabled).toBe(false);
});
await test("4. An account left mid-setup still sees the setup pages at log in", "src/app/App.tsx → App (background setup), src/features/onboarding.tsx → enter", async () => {
  const api = server();
  mount(ui());
  await type(await waitFor(() => byLabel("Email address")), "ada@example.edu");
  await type(byLabel("Password"), PASSWORD);
  await click(byRole("button", "Log in"));
  await waitFor(() => byRole("heading", "Your week at a glance"));
  await waitFor(() => onboardingRequests(api).length > 0);
  expect(onboardingRequests(api).length).toBe(1);
  expect(byRole("heading", "What are you learning?")).toBe(null);
});
await test("5. The syllabus step or \"Let’s begin\" is still reachable", "src/features/onboarding.tsx → Onboarding", async () => {
  server();
  mount(ui());
  await createAccount();
  expect(goneTexts()).toEqual([]);
  await saveCode();
  await click(continueButton());
  await waitFor(greeting);
  expect(goneTexts()).toEqual([]);
});
await test("6. A failed onboarding request leaves the student stuck without a message", FLOW, async () => {
  server({ status: 500, body: { error: "Could not save your setup. Try again." } });
  mount(ui());
  await createAccount();
  await saveCode();
  await click(continueButton());
  await waitFor(() => byText("Could not save your setup. Try again."));
  expect(byRole("heading", "Save your recovery code") !== null).toBe(true);
  expect(continueButton().disabled).toBe(false);
});
await test("7. The recovery code screen scrolls sideways on a 320 px phone", "src/features/settings.module.css → .recoveryCode (src/features/onboarding.module.css → .onboarding)", async () => {
  // The screen as Onboarding lays it out; typing the sign-up form into a phone-width iframe is not supported by the harness.
  mount(<div className={s.onboarding}><main className={s.onboardingMain}><div className={s.onboardingContent}><RecoveryCode code={CODE} onDone={() => {}} /></div></main></div>, { width: 320 });
  await waitFor(() => byRole("heading", "Save your recovery code"));
  expect(pageScrollWidth() <= 320).toBe(true);
});
