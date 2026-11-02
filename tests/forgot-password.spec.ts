// Card 178: resetting a forgotten password with the recovery code, against the mocked API in
// support/account-fixture.ts. The card's by-hand steps run the same checks on aptitude.
import type { Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";

const email = "notely-task-recovery-442@example.edu";
const first = "Sample river password 42!";
const second = "Recovered meadow password 44!";
const third = "Third meadow password 45!";
const badCode = "Recovery codes have 32 characters using only numbers 0–9 and letters A–F, like 1A2B-3C4D-….";

// Signs up and returns the recovery code shown once at signup.
async function signUp(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByLabel("Your name").fill("Recovery Tester");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(first);
  await page.getByLabel("Confirm password", { exact: true }).fill(first);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const code = (await page.getByLabel("Recovery code", { exact: true }).textContent())!;
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "I’ll do this later" }).click();
  await page.getByRole("button", { name: "Let’s begin" }).click();
  await expect(page.getByRole("heading", { name: /Good .*Recovery/ })).toBeVisible();
  return code;
}
const logOutButton = (page: Page) => page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true }).first();
// Logging out from Home shows the welcome screen, and from other pages the sign-in screen, so both are handled.
async function logOut(page: Page) {
  await logOutButton(page).click();
  await expect(page.getByRole("heading", { name: /^(Welcome to your space\.|Good to see you again\.)$/ })).toBeVisible();
  const already = page.getByRole("button", { name: "I already have an account" });
  if (await already.isVisible()) await already.click();
  await expect(page.getByRole("heading", { name: "Good to see you again." })).toBeVisible();
}
// Signing in returns to the last page visited, so being signed in is checked by "Log out", not a page.
async function logIn(page: Page, password: string) {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
}
async function reset(page: Page, code: string, password: string) {
  await page.getByRole("button", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { name: "Recover your account." })).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Recovery code", { exact: true }).fill(code);
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
}
// Acknowledges a replacement code and returns it.
async function saveNewCode(page: Page) {
  const code = (await page.getByLabel("Recovery code", { exact: true }).textContent())!;
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  return code;
}

test("Task test 1 - a correct recovery code resets the password and gives a new code", async ({ page }) => {
  const code = await signUp(page);
  await logOut(page);
  await reset(page, code, second);
  await expect(page.getByRole("heading", { name: "Save your recovery code" })).toBeVisible();
  expect(await saveNewCode(page)).not.toBe(code);
  await expect(page.getByText("Password reset. Sign in with your new password.")).toBeVisible();
  await logIn(page, second);
  await expect(logOutButton(page)).toBeVisible();
});

test("Task test 2 - after a reset, the old password and the used code are refused", async ({ page }) => {
  const code = await signUp(page);
  await logOut(page);
  await reset(page, code, second);
  await saveNewCode(page);
  await logIn(page, first);
  await expect(page.getByRole("alert")).toHaveText("Email or password is incorrect.");
  await reset(page, code, third);
  await expect(page.getByRole("alert")).toHaveText("Email or recovery code is incorrect.");
});

test("Task test 3 - a badly typed code is caught before anything is sent", async ({ page }) => {
  await signUp(page);
  await logOut(page);
  const sent: string[] = [];
  page.on("request", (request) => { if (request.url().includes("route=reset-password")) sent.push(request.url()); });
  await reset(page, "not-a-code", second);
  await expect(page.getByText(badCode)).toBeVisible();
  await expect(page.getByLabel("Recovery code", { exact: true })).toBeFocused();
  expect(sent).toEqual([]);
});

test("Task test 4 - replacing the code in Settings stops the old one", async ({ page }) => {
  const code = await signUp(page);
  await page.getByRole("link", { name: "Settings" }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Replace recovery code" }).click();
  const replace = page.getByRole("dialog", { name: "Replace recovery code" });
  await expect(replace.getByText("Your previous recovery code will stop working. Save the replacement before leaving this screen.")).toBeVisible();
  await replace.getByLabel("Current password").fill(first);
  await replace.getByRole("button", { name: "Generate replacement code" }).click();
  await expect(page.getByRole("dialog", { name: "Your new recovery code" })).toBeVisible();
  const replacement = await saveNewCode(page);
  expect(replacement).not.toBe(code);
  await logOut(page);
  await reset(page, code, second);
  await expect(page.getByRole("alert")).toHaveText("Email or recovery code is incorrect.");
  await page.getByLabel("Recovery code", { exact: true }).fill(replacement);
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Save your recovery code" })).toBeVisible();
  await saveNewCode(page);
  await logIn(page, second);
  await expect(logOutButton(page)).toBeVisible();
});
