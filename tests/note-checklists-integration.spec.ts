import { test, expect as baseExpect } from "@playwright/test";
import type { Page } from "@playwright/test";

// Requires an isolated PHP API/database with migrations 001-007; never use cattle.
// Unlike account-fixture tests, requests here go to the real PHP backend.
test.skip(process.env.NOTELY_CHECKLIST_INTEGRATION !== "1", "Set NOTELY_CHECKLIST_INTEGRATION=1 with an isolated local API/database.");

const expect = baseExpect.configure({ timeout: 20000 });
const rows = (page: Page) => page.getByRole("region", { name: "Checklist", exact: true });
const fields = (page: Page) => rows(page).getByRole("textbox");
async function save(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
}
async function add(page: Page, texts: string[]) {
  await page.getByRole("button", { name: "Add checklist", exact: true }).click();
  for (const [index, text] of texts.entries()) {
    await expect(fields(page).nth(index)).toBeFocused();
    await fields(page).nth(index).fill(text);
    if (index < texts.length - 1) await fields(page).nth(index).press("Enter");
  }
}

async function accountNote(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByLabel("Your name").fill("Jamie");
  await page.getByLabel("Email address").fill(`checklists-${Date.now()}-${Math.random().toString(36).slice(2)}@example.edu`);
  await page.getByLabel("Password", { exact: true }).fill("Sample meadow password 42!");
  await page.getByLabel("Confirm password", { exact: true }).fill("Sample meadow password 42!");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: /do this later/ }).click();
  await page.getByRole("button", { name: /begin/ }).click();
  await expect(page.getByRole("heading", { name: /Good .*Jamie/ })).toBeVisible();
  await page.goto("/notes");
  await page.getByRole("button", { name: "Create Note", exact: true }).click();
  await page.getByLabel("Note title").fill("Sprint tasks");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("heading", { name: "Sprint tasks", exact: true }).click();
}


test("Story #19 AT1-3 persist through the real API and database", async ({ page }) => {
  test.setTimeout(180000);
  await accountNote(page);
  await add(page, ["Write task tests", "Update the board", "Merge into dev"]);
  await save(page);
  await rows(page).getByRole("checkbox").first().check();
  await expect(fields(page).first()).toHaveCSS("text-decoration-line", "line-through");
  await save(page);
  await page.reload();
  await expect(rows(page).getByRole("checkbox").first()).toBeChecked();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await fields(page).nth(3).fill("Demo to the TA");
  await page.getByRole("button", { name: "Remove Update the board", exact: true }).click();
  await save(page);
  await page.reload();
  await expect(fields(page)).toHaveCount(3);
  await expect(fields(page).nth(0)).toHaveValue("Write task tests");
  await expect(fields(page).nth(1)).toHaveValue("Merge into dev");
  await expect(fields(page).nth(2)).toHaveValue("Demo to the TA");
  await expect(rows(page).getByRole("checkbox").nth(0)).toBeChecked();
  await expect(rows(page).getByRole("checkbox").nth(1)).not.toBeChecked();
  await expect(rows(page).getByRole("checkbox").nth(2)).not.toBeChecked();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await save(page);
  await page.reload();
  await expect(fields(page)).toHaveCount(3);
  await page.getByLabel("Note body").fill("Title/body save preserves persisted checklist");
  await save(page);
  await page.reload();
  await expect(fields(page)).toHaveCount(3);
  await expect(rows(page).getByRole("checkbox").first()).toBeChecked();
  // Remove the account and its cascading test records from this isolated database.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await page.getByLabel("Current password").fill("Sample meadow password 42!");
  await page.getByLabel("I understand that deletion is permanent").check();
  await page.getByRole("button", { name: "Permanently delete account", exact: true }).click();
});
