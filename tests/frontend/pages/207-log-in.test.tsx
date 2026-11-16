// Frontend test: real screen code, API replaced. Every request must be scripted.
import "@fontsource-variable/inter";
import "../../../src/app/global.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byText, byLabel, click, type, press, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import { Onboarding } from "../../../src/features/onboarding";

page({ card: "207", title: "Frontend: Log in screen", kind: "frontend" });

const ONBOARDING = { completed: false, step: 0 };
const signedOut = { user: null, onboarding: ONBOARDING, csrfToken: "test-token" };
const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu" };
const LOGIN = "src/features/onboarding.tsx → Onboarding (enter)";

// The real log in screen, opened on its "Good to see you again." step (?mode=signin), inside the real Provider.
const ui = <MemoryRouter initialEntries={["/?mode=signin"]}><Provider><Onboarding /></Provider></MemoryRouter>;
const logins = (api: { sent: { route: string }[] }) => api.sent.filter((r) => r.route === "login");

await test("1. The log in form is missing a field or its button", LOGIN, async () => {
  stubApi({ session: signedOut });
  mount(ui);
  await waitFor(() => byRole("heading", "Good to see you again."));
  expect(byLabel("Email address") !== null).toBe(true);
  expect(byLabel("Password") !== null).toBe(true);
  expect(byRole("button", "Log in") !== null).toBe(true);
});
await test("2. Correct details send no login request, or the wrong email", LOGIN, async () => {
  const api = stubApi({ session: signedOut, login: { ...signedOut, user: ada } });
  mount(ui);
  await type(await waitFor(() => byLabel("Email address")), "ada@example.edu");
  await type(byLabel("Password"), "TestPassword2026!");
  await click(byRole("button", "Log in"));
  await waitFor(() => logins(api).length > 0);
  expect(logins(api).length).toBe(1);
  expect(logins(api)[0].body).toEqual({ email: "ada@example.edu", password: "TestPassword2026!" });
  expect(logins(api)[0].csrf).toBe("test-token");
});
await test("3. A wrong password shows no reason, or a different one", "src/services/auth.ts → send, src/features/onboarding.tsx → enter", async () => {
  stubApi({ session: signedOut, login: { status: 401, body: { error: "Email or password is incorrect." } } });
  mount(ui);
  await type(await waitFor(() => byLabel("Email address")), "ada@example.edu");
  await type(byLabel("Password"), "WrongPassword2026!");
  await click(byRole("button", "Log in"));
  await waitFor(() => byText("Email or password is incorrect."));
});
await test("4. A request nobody scripted goes unnoticed", "tests/frontend/harness.tsx → stubApi", async () => {
  const api = stubApi({ session: signedOut });           // route=login is deliberately not scripted
  mount(ui);
  await type(await waitFor(() => byLabel("Email address")), "ada@example.edu");
  await type(byLabel("Password"), "TestPassword2026!");
  await click(byRole("button", "Log in"));
  await waitFor(() => api.unexpected.length > 0);
  expect(api.unexpected).toEqual(["login"]);
  api.unexpected.length = 0;                             // caught: clear it so this case itself passes
});
await test("5. The log in screen scrolls sideways on a 320 px phone", "src/app/App.module.css → .onboarding, .onboardingMain", async () => {
  stubApi({ session: signedOut });
  mount(ui, { width: 320 });
  await waitFor(() => byRole("button", "Log in"));
  expect(pageScrollWidth() <= 320).toBe(true);
});
await test("6. The form can't be sent with the keyboard alone", LOGIN, async () => {
  const api = stubApi({ session: signedOut, login: { ...signedOut, user: ada } });
  mount(ui);
  await type(await waitFor(() => byLabel("Email address")), "ada@example.edu");
  await type(byLabel("Password"), "TestPassword2026!");
  await press(byLabel("Password"), "Enter");
  await waitFor(() => logins(api).length > 0);
  expect(logins(api).length).toBe(1);
});
