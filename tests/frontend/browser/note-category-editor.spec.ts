import { type Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";

// Card 40: the category selector in the note editor.
async function openNewNote(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await page.goto("/notes");
  await page.getByRole("button", { name: "Create Note" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Note" });
  await dialog.getByLabel("Note title").fill(title);
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.getByRole("heading", { name: title, exact: true }).click();
  await expect(page.getByLabel("Note title")).toHaveValue(title);
  return page.getByLabel("Category");
}

const failSaves = (page: Page) =>
  page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreSaves: () => void }).restoreSaves = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("notely-data-v1")) throw new Error("quota");
      return original.call(this, key, value);
    };
  });
const restoreSaves = (page: Page) => page.evaluate(() => (window as unknown as { restoreSaves: () => void }).restoreSaves());

test("Test 1 - display and change a note category", async ({ page }) => {
  const category = await openNewNote(page, "Algebra review");
  await category.selectOption("Personal");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Category")).toHaveValue("Personal");

  const options = await page.getByLabel("Category").locator("option").allInnerTexts();
  expect(options).toEqual(["School", "Work", "Meetings", "Personal"]);

  await page.getByLabel("Category").selectOption("Meetings");
  await expect(page.getByText("Saving…", { exact: true })).toBeVisible();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Category")).toHaveValue("Meetings");
});

test("Test 2 - a note starts in School and needs no category choice", async ({ page }) => {
  const category = await openNewNote(page, "Default category");
  await expect(category).toHaveValue("School");
  await page.waitForTimeout(1000);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Category")).toHaveValue("School");
});

test("Test 3 - a failed category save shows an alert and returns to the last saved category", async ({ page }) => {
  const category = await openNewNote(page, "Algebra review");
  await failSaves(page);
  await category.selectOption("Work");
  await expect(page.getByRole("alert")).toContainText("The category could not be saved.");
  await expect(page.getByLabel("Category")).toHaveValue("School");
  await expect(page.getByText("Not saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Category")).toHaveValue("School");
});

test("a later successful category save clears the alert", async ({ page }) => {
  const category = await openNewNote(page, "Retry category");
  await failSaves(page);
  await category.selectOption("Work");
  await expect(page.getByRole("alert")).toContainText("The category could not be saved.");
  await restoreSaves(page);
  await page.getByLabel("Category").selectOption("Meetings");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Category")).toHaveValue("Meetings");
});

test("a failed category save keeps other saved edits and does not retry in a loop", async ({ page }) => {
  const category = await openNewNote(page, "Keep my title");
  await category.selectOption("Work");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await failSaves(page);
  await page.getByLabel("Category").selectOption("Personal");
  await expect(page.getByRole("alert")).toContainText("The category could not be saved.");
  // The selector shows the last saved value (Work, not School) and stays there.
  await expect(page.getByLabel("Category")).toHaveValue("Work");
  await page.waitForTimeout(2000);
  await expect(page.getByLabel("Category")).toHaveValue("Work");
  await expect(page.getByRole("alert")).toContainText("The category could not be saved.");
});
