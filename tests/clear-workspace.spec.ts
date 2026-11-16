import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";

// Card 167: clearing a signed-in workspace needs CLEAR typed into the "Start fresh?" window first.
const password = "Sample river password 42!";

// Clearing deletes each note the student owns on the server, so note-delete requests are the clear requests.
function countClears(page: Page) {
  const seen = { count: 0 };
  page.on("request", (r) => { if (new URL(r.url()).searchParams.get("route") === "note-delete") seen.count += 1; });
  return seen;
}

async function register(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByLabel("Your name").fill("Clear Tester");
  await page.getByLabel("Email address").fill("notely-task167-442@example.edu");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "I’ll do this later" }).click();
  await page.getByRole("button", { name: "Let’s begin" }).click();
  await expect(page.getByRole("heading", { name: /Good .*Clear/ })).toBeVisible();
}

async function createNote(page: Page, title: string) {
  await page.goto("/notes");
  await page.getByRole("button", { name: "Create Note" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Note" });
  await dialog.getByLabel("Note title").fill(title);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

// Opens the window from the Settings page that is already showing.
async function openClear(page: Page) {
  await page.getByRole("button", { name: "Clear workspace", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Start fresh?" });
  await expect(dialog).toBeVisible();
  return {
    dialog,
    box: dialog.getByLabel("Type CLEAR to confirm"),
    clear: dialog.getByRole("button", { name: "Clear workspace", exact: true }),
  };
}

async function close(dialog: Locator) {
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
}

test("disabled until CLEAR", async ({ page }) => {
  await register(page);
  await page.goto("/settings");
  const { box, clear } = await openClear(page);
  await expect(box).toHaveValue("");
  await expect(clear).toBeDisabled();
  for (const wrong of ["clear", "CLEA", " CLEAR", "CLEAR "]) {
    await box.fill(wrong);
    await expect(clear, `"${wrong}" must not enable clearing`).toBeDisabled();
  }
  await box.fill("CLEAR");
  await expect(clear).toBeEnabled();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("clears only after CLEAR", async ({ page }) => {
  const clears = countClears(page);
  await register(page);
  await createNote(page, "Keep me");
  await page.goto("/settings");
  let { dialog, box, clear } = await openClear(page);
  await box.press("Enter");
  await expect(dialog).toBeVisible();
  await box.fill("clear");
  await box.press("Enter");
  await expect(dialog).toBeVisible();
  await close(dialog);
  // Reloading the Notes page reads the list back from the mocked server.
  await page.goto("/notes");
  await expect(page.getByRole("heading", { name: "Keep me", exact: true })).toBeVisible();
  expect(clears.count).toBe(0);

  await page.goto("/settings");
  ({ dialog, box, clear } = await openClear(page));
  await box.fill("CLEAR");
  await clear.click();
  await expect(dialog).toHaveCount(0);
  expect(clears.count).toBe(1);
  await page.goto("/notes");
  await expect(page.getByRole("heading", { name: "Your notes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keep me", exact: true })).toHaveCount(0);
});

test("resets when closed", async ({ page }) => {
  await register(page);
  await page.goto("/settings");
  const first = await openClear(page);
  await first.box.fill("CLEAR");
  await close(first.dialog);
  const again = await openClear(page);
  await expect(again.box).toHaveValue("");
  await expect(again.clear).toBeDisabled();
});

test("demo reset unchanged", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Reset sample data", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Start fresh?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Type CLEAR to confirm")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Reset workspace", exact: true })).toBeEnabled();
});

test("signed out cannot clear", async ({ page }) => {
  const clears = countClears(page);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Good to see you again." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear workspace" })).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(clears.count).toBe(0);
});
