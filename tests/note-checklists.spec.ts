import AxeBuilder from "@axe-core/playwright";
﻿import { test, expect } from "./support/account-fixture";
import type { Page } from "@playwright/test";

const rows = (page: Page) => page.getByRole("region", { name: "Checklist", exact: true });
const fields = (page: Page) => rows(page).getByRole("textbox");
async function save(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
}
async function demo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await page.goto("/notes/note-1");
  await expect(page.getByLabel("Note body")).toBeVisible();
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
  await page.getByLabel("Email address").fill("checklists@example.edu");
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

// These are deliberately sequential: Task Tests 2 and 3 use Test 1's exact rows.
test("official Task #78 tests: checkboxes, independent completion, removal", async ({ page }) => {
  await accountNote(page);
  await add(page, ["Finish homework", "Study for exam"]);
  await expect(fields(page)).toHaveCount(2);
  const checks = rows(page).getByRole("checkbox");
  await expect(checks).toHaveCount(2);
  await expect(checks.nth(0)).not.toBeChecked();
  await expect(checks.nth(1)).not.toBeChecked();
  await checks.nth(0).check();
  await expect(checks.nth(0)).toBeChecked();
  await expect(fields(page).nth(0)).toHaveCSS("text-decoration-line", "line-through");
  await expect(checks.nth(1)).not.toBeChecked();
  await expect(fields(page).nth(1)).toHaveCSS("text-decoration-line", "none");
  await page.getByRole("button", { name: "Remove Study for exam", exact: true }).click();
  await expect(fields(page)).toHaveCount(1);
  await expect(fields(page).first()).toHaveValue("Finish homework");
  await expect(checks.first()).toBeChecked();
  await save(page);
  await page.reload();
  await expect(fields(page).first()).toHaveValue("Finish homework");
  await expect(checks.first()).toBeChecked();
});

test("Story #19 acceptance 1–3: ordered tasks survive save/reload and blank items do not", async ({ page }) => {
  await demo(page);
  await page.getByLabel("Note title").fill("Sprint tasks");
  await page.getByLabel("Note body").fill("Sprint body");
  await add(page, ["Write task tests", "Update the board", "Merge into dev"]);
  await save(page);
  await rows(page).getByRole("checkbox").first().check();
  await expect(fields(page).first()).toHaveCSS("text-decoration-line", "line-through");
  await save(page);
  await page.reload();
  await expect(rows(page).getByRole("checkbox").first()).toBeChecked();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(fields(page).nth(3)).toBeFocused();
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
  await fields(page).nth(3).fill("   ");
  await page.getByLabel("Note body").fill("Sprint body updated");
  await save(page);
  await page.reload();
  await expect(fields(page)).toHaveCount(3);
  await expect(page.getByLabel("Note title")).toHaveValue("Sprint tasks");
  await expect(page.getByLabel("Note body")).toHaveValue("Sprint body updated");
  await rows(page).getByRole("checkbox").first().focus();
  await page.keyboard.press("Space");
  await save(page);
  await page.reload();
  await expect(rows(page).getByRole("checkbox").first()).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).include('[aria-label="Checklist"]').analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: `test-results/checklist-${test.info().project.name}.png`, fullPage: true });
});

test("failure preserves drafts; cancel, clearing and switching notes isolate state", async ({ page }) => {
  await demo(page);
  await add(page, ["Keep this draft", "Second"]);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "notely-data-v1") {
        Storage.prototype.setItem = original;
        throw new Error("Checklist storage failure");
      }
      original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Changes could not be saved");
  await expect(page.getByText("All changes saved", { exact: true })).toHaveCount(0);
  await expect(fields(page).first()).toHaveValue("Keep this draft");
  await save(page);
  await fields(page).first().fill("Discard this");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(fields(page).first()).toHaveValue("Keep this draft");
  await page.goto("/notes/note-2");
  await expect(page.getByRole("button", { name: "Add checklist", exact: true })).toBeVisible();
  await page.goto("/notes/note-1");
  await expect(fields(page).first()).toHaveValue("Keep this draft");
  await fields(page).first().press("Enter");
  await expect(fields(page).nth(1)).toBeFocused();
  await expect(fields(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Remove Keep this draft", exact: true }).click();
  await page.getByRole("button", { name: "Remove Second", exact: true }).click();
  await save(page);
  await page.reload();
  await expect(fields(page)).toHaveCount(0);
});


test("read-only collaborators can inspect tasks but cannot edit them", async ({ page }) => {
  await accountNote(page);
  await add(page, ["Read only task"]);
  await save(page);
  await page.route("**/api/index.php?route=note-collaborators&*", (route) => route.fulfill({
    json: { collaborators: [{ id: "42", name: "Jamie", email: "checklists@example.edu", permission: "view" }] },
  }));
  await page.reload();
  await expect(fields(page).first()).toHaveValue("Read only task");
  await expect(fields(page).first()).toBeDisabled();
  await expect(rows(page).getByRole("checkbox").first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add item", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Remove Read only task", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});

test("a pending save cannot overwrite a different note after navigation", async ({ page }) => {
  await accountNote(page);
  await add(page, ["Pending task"]);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void;
  const saving = new Promise<void>((resolve) => { started = resolve; });
  await page.route("**/api/index.php?route=note-save", async (route) => {
    const note = { ...route.request().postDataJSON(), ownerId: "42", pinned: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    started();
    await gate;
    await route.fulfill({ json: { note } });
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await saving;
  await expect(fields(page).first()).toBeDisabled();
  await page.getByRole("link", { name: "All notes", exact: true }).click();
  await page.getByRole("button", { name: "Create Note", exact: true }).click();
  await page.getByLabel("Note title").fill("Other note");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("heading", { name: "Other note", exact: true }).click();
  await expect(page.getByLabel("Note title")).toHaveValue("Other note");
  release();
  await expect(page.getByRole("button", { name: "Add checklist", exact: true })).toBeVisible();
  await expect(fields(page)).toHaveCount(0);
});
