// Frontend test: real landing screen, API replaced. Every request must be scripted.
import "@fontsource-variable/inter";
import "../../../src/app/global.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byText, byLabel, click, type, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import { Onboarding } from "../../../src/features/onboarding";

page({ card: "210", title: "Frontend: Log in first on the landing page", kind: "frontend" });

const signedOut = { user: null, onboarding: { completed: false, step: 0 }, csrfToken: "test-token" };
const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu" };
const WHERE = "src/features/onboarding.tsx → Onboarding";
const ui = <MemoryRouter initialEntries={["/"]}><Provider><Onboarding /></Provider></MemoryRouter>;
const logins = (api: { sent: { route: string }[] }) => api.sent.filter((r) => r.route === "login");
const BANNED = ["Sign in", "Sign out", "Log In", "Create your workspace", "Take a look around", "I already have an account"];
const noBanned = () => BANNED.filter((t) => document.body.textContent?.includes(t));

await test("1. The first page is not the log in form", WHERE, async () => {
  stubApi({ session: signedOut });
  mount(ui);
  await waitFor(() => byLabel("Email address"));
  expect(byLabel("Password") !== null).toBe(true);
  expect(byRole("button", "Log in") !== null).toBe(true);
  expect(byRole("button", "Forgot password?") !== null).toBe(true);
});
await test("2. \"Create account\" is missing or as loud as \"Log in\"", "src/features/onboarding.tsx → Onboarding, src/features/onboarding.module.css → .switch", async () => {
  stubApi({ session: signedOut });
  mount(ui);
  await waitFor(() => byText(/New to Notely\?/));
  const create = byRole("button", "Create account");
  const login = byRole("button", "Log in");
  expect(create !== null && login !== null).toBe(true);
  expect(getComputedStyle(create!).backgroundColor !== getComputedStyle(login!).backgroundColor).toBe(true);
});
await test("3. \"Create account\" does not open the create form", WHERE, async () => {
  stubApi({ session: signedOut });
  mount(ui);
  await click(await waitFor(() => byRole("button", "Create account")));
  await waitFor(() => byLabel("Confirm password"));
  expect(byLabel("Your name") !== null).toBe(true);
});
await test("4. The create form has no way back to Log in", WHERE, async () => {
  stubApi({ session: signedOut });
  mount(ui);
  await click(await waitFor(() => byRole("button", "Create account")));
  await click(await waitFor(() => byRole("button", "Already have an account? Log in")));
  await waitFor(() => byRole("button", "Log in"));
});
await test("5. Old wording (Sign in, Log In, Create your workspace, sample) is still shown", WHERE, async () => {
  stubApi({ session: signedOut });
  mount(ui);
  await waitFor(() => byRole("button", "Log in"));
  expect(noBanned()).toEqual([]);
  await click(byRole("button", "Create account"));
  await waitFor(() => byLabel("Confirm password"));
  expect(noBanned()).toEqual([]);
});
await test("6. Correct details send no login request, or the wrong one", "src/features/onboarding.tsx → enter", async () => {
  const api = stubApi({ session: signedOut, login: { ...signedOut, user: ada } });
  mount(ui);
  await type(await waitFor(() => byLabel("Email address")), "ada@example.edu");
  await type(byLabel("Password"), "TestPassword2026!");
  await click(byRole("button", "Log in"));
  await waitFor(() => logins(api).length > 0);
  expect(logins(api).length).toBe(1);
  expect(logins(api)[0].body).toEqual({ email: "ada@example.edu", password: "TestPassword2026!" });
});
await test("7. A wrong password shows no reason, or a different one", "src/features/onboarding.tsx → enter", async () => {
  stubApi({ session: signedOut, login: { status: 401, body: { error: "Email or password is incorrect." } } });
  mount(ui);
  await type(await waitFor(() => byLabel("Email address")), "ada@example.edu");
  await type(byLabel("Password"), "WrongPassword2026!");
  await click(byRole("button", "Log in"));
  await waitFor(() => byText("Email or password is incorrect."));
});
await test("8. \"Forgot password?\" does not open the reset form", "src/features/onboarding.tsx → changeMode", async () => {
  stubApi({ session: signedOut });
  mount(ui);
  await click(await waitFor(() => byRole("button", "Forgot password?")));
  await waitFor(() => byRole("heading", "Recover your account."));
  expect(byLabel("Recovery code") !== null).toBe(true);
});
await test("9. The landing page scrolls sideways on a 320 px phone", "src/features/onboarding.module.css → .switch, src/app/App.module.css → .onboarding", async () => {
  stubApi({ session: signedOut });
  mount(ui, { width: 320 });
  await waitFor(() => byRole("button", "Log in"));
  expect(pageScrollWidth() <= 320).toBe(true);
});
