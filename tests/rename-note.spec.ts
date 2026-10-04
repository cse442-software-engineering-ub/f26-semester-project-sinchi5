import { type Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";

async function openCreatedNote(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await page.goto("/notes");
  await page.getByRole("button", { name: "Create Note" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Note" });
  await dialog.getByLabel("Note title").fill(title);
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.getByRole("heading", { name: title, exact: true }).click();
  await expect(page.getByLabel("Note title")).toHaveValue(title);
}

test("Test 1 - Rename a note", async ({ page }) => {
  await openCreatedNote(page, "CSE 442 Notes");
  await page.getByLabel("Note title").fill("CSE 442 Sprint Notes");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Note title")).toHaveValue("CSE 442 Sprint Notes");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "All notes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "CSE 442 Sprint Notes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "CSE 442 Notes", exact: true })).toHaveCount(0);
});

test("Test 2 - Preserve the old title when saving fails", async ({ page }) => {
  await openCreatedNote(page, "CSE 442 Notes");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("notely-data-v1")) throw new Error("quota");
      return original.call(this, key, value);
    };
  });
  await page.getByLabel("Note title").fill("New Title");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("could not be saved");
  await page.reload();
  await expect(page.getByLabel("Note title")).toHaveValue("CSE 442 Notes");
});

test("Test 3 - Cancel a title change", async ({ page }) => {
  await openCreatedNote(page, "CSE 442 Notes");
  await page.getByLabel("Note title").fill("Temporary Title");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("link", { name: "All notes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Temporary Title" })).toHaveCount(0);
  await page.getByRole("heading", { name: "CSE 442 Notes", exact: true }).click();
  await expect(page.getByLabel("Note title")).toHaveValue("CSE 442 Notes");
});
