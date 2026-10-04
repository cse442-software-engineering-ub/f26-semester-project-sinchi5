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

test("renamed note appears in the list and remains renamed after refresh", async ({ page }) => {
  await openCreatedNote(page, "CSE 442 Lecture Notes");
  await page.getByLabel("Note title").fill("CSE 442 Sprint Notes");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Note title")).toHaveValue("CSE 442 Sprint Notes");
  await page.getByRole("link", { name: "All notes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "CSE 442 Sprint Notes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "CSE 442 Lecture Notes" })).toHaveCount(0);
  await page.getByRole("heading", { name: "CSE 442 Sprint Notes" }).click();
  await page.reload();
  await expect(page.getByLabel("Note title")).toHaveValue("CSE 442 Sprint Notes");
});

test("Cancel discards a pending title change", async ({ page }) => {
  await openCreatedNote(page, "Exam Review Notes");
  await page.getByLabel("Note title").fill("New Name");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("link", { name: "All notes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Exam Review Notes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "New Name" })).toHaveCount(0);
  await page.getByRole("heading", { name: "Exam Review Notes" }).click();
  await expect(page.getByLabel("Note title")).toHaveValue("Exam Review Notes");
});

test("failed Save reports an error and preserves the old title", async ({ page }) => {
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
