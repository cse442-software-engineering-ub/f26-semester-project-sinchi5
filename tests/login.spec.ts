import { test, expect } from "./support/account-fixture";
import type { Page } from "@playwright/test";

const email = "student@example.com";
const password = "Password123!";
const user = { id: "101", name: "Student", email };

// Intercept only the existing HTTP auth boundary; production repositories stay intact.
async function mockLogin(page: Page, options: { fail?: boolean; completed?: boolean; wait?: Promise<void> } = {}) {
  let authenticated = false;
  const credentials: unknown[] = [];
  await page.route("**/api/index.php?route=*", async route => {
    const action = new URL(route.request().url()).searchParams.get("route");
    if (action === "login") {
      expect(route.request().method()).toBe("POST");
      credentials.push(route.request().postDataJSON());
      await options.wait;
      if (options.fail) {
        await route.fulfill({ status: 401, json: { error: "Email or password is incorrect." } });
        return;
      }
      authenticated = true;
    }
    await route.fulfill({ json: {
      user: authenticated ? user : null,
      onboarding: { completed: authenticated && options.completed !== false, step: options.completed === false ? 0 : 3 },
      csrfToken: "login-fixture-csrf",
    } });
  });
  return credentials;
}

async function openLogin(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "I already have an account" }).click();
  await expect(page.getByRole("button", { name: "Log In", exact: true })).toBeVisible();
}

async function expectLogin(page: Page) {
  await expect(page.getByRole("button", { name: "Log In", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your notes", exact: true })).not.toBeVisible();
  await expect(page).toHaveURL(/welcome/);
}

test("valid login submits credentials and opens the authenticated notes page", async ({ page }) => {
  const credentials = await mockLogin(page);
  await openLogin(page);
  const emailInput = page.getByLabel("Email address");
  const passwordInput = page.getByLabel("Password", { exact: true });
  await expect(emailInput).toHaveAttribute("type", "email");
  await expect(emailInput).toHaveAttribute("autocomplete", "email");
  await expect(emailInput).toHaveAttribute("required", "");
  await expect(passwordInput).toHaveAttribute("type", "password");
  await expect(passwordInput).toHaveAttribute("autocomplete", "current-password");
  await expect(passwordInput).toHaveAttribute("required", "");
  await emailInput.focus();
  await page.keyboard.type(email);
  await page.keyboard.press("Tab");
  await expect(passwordInput).toBeFocused();
  await page.keyboard.type(password);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Log In", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Your notes", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/notes/);
  expect(credentials).toEqual([{ email, password }]);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toContain(password);
  expect(page.url()).not.toContain(password);
});

test("incorrect password displays a generic alert and keeps entered fields on Login", async ({ page }) => {
  const credentials = await mockLogin(page, { fail: true });
  await openLogin(page);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("WrongPassword");
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Email or password is incorrect.");
  await expectLogin(page);
  await expect(page.getByLabel("Email address")).toHaveValue(email);
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("WrongPassword");
  expect(credentials).toEqual([{ email, password: "WrongPassword" }]);
});

test("empty fields show both required messages, focus email, and send no login request", async ({ page }) => {
  const credentials = await mockLogin(page);
  await openLogin(page);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(page.getByText("Enter your email address.", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter your password.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeFocused();
  await expect(page.getByLabel("Email address")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expectLogin(page);
  expect(credentials).toEqual([]);
});

test("invalid email and empty password are rejected before authentication", async ({ page }) => {
  const credentials = await mockLogin(page);
  await openLogin(page);
  await page.getByLabel("Email address").fill("student");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(page.getByLabel("Email address")).toBeFocused();
  await expect(page.getByText("Email addresses need exactly one @, like name@university.edu.")).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("");
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(page.getByText("Enter your password.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  expect(credentials).toEqual([]);
});

test("pending login disables the form and prevents duplicate submissions", async ({ page }) => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const credentials = await mockLogin(page, { wait });
  await openLogin(page);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  try {
    await expect.poll(() => credentials.length).toBe(1);
    await expect(page.getByRole("button", { name: "Opening your space…" })).toBeDisabled();
    await expect(page.getByLabel("Email address")).toBeDisabled();
    await expect(page.getByLabel("Password", { exact: true })).toBeDisabled();
    await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
    await page.locator("form").evaluate(form => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  } finally { release(); }
  await expect(page.getByRole("heading", { name: "Your notes", exact: true })).toBeVisible();
  expect(credentials).toHaveLength(1);
});

test("login preserves unfinished onboarding", async ({ page }) => {
  const credentials = await mockLogin(page, { completed: false });
  await openLogin(page);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What are you learning?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your notes", exact: true })).not.toBeVisible();
  expect(credentials).toEqual([{ email, password }]);
});
