import { test, expect, type Page } from "@playwright/test";

// Card 117 drives the dialog on a test-only page with a mocked delete operation.
type Mock = { deleteCalls: number; deleteMode: "resolve" | "pending" | "reject" };
const calls = (page: Page) => page.evaluate(() => (window as unknown as Mock).deleteCalls);
const mode = (page: Page, value: Mock["deleteMode"]) =>
  page.evaluate((v) => { (window as unknown as Mock).deleteMode = v; }, value);

async function openDialog(page: Page) {
  await page.getByRole("button", { name: "Delete Calculus review" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this note?" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/harness/delete-note-dialog.html");
});

test("Test 1 - shows the note title, warning, buttons, and takes focus", async ({ page }) => {
  const dialog = await openDialog(page);
  await expect(dialog.getByRole("heading", { name: "Delete this note?" })).toBeVisible();
  await expect(dialog).toContainText("“Calculus review”");
  await expect(dialog).toContainText("its comments and history will be permanently removed");
  await expect(dialog.getByRole("button", { name: "Delete note", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
});

test("Test 2 - Cancel and Escape close without deleting and return focus", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Delete Calculus review" });
  let dialog = await openDialog(page);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await calls(page)).toBe(0);
  await expect(trigger).toBeFocused();

  dialog = await openDialog(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await calls(page)).toBe(0);
  await expect(trigger).toBeFocused();
});

test("Test 3 - a pending delete disables the buttons and sends one request", async ({ page }) => {
  await mode(page, "pending");
  const dialog = await openDialog(page);
  const confirm = dialog.getByRole("button", { name: "Delete note", exact: true });
  // Two synchronous clicks land before React re-renders the disabled state.
  await confirm.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(confirm).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("status")).toHaveText("Deleting note…");
  await confirm.click({ force: true });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  expect(await calls(page)).toBe(1);
});

test("a failed delete keeps the dialog open with an alert and allows a retry", async ({ page }) => {
  await mode(page, "reject");
  const dialog = await openDialog(page);
  await dialog.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("This note could not be deleted. Mocked failure.");
  await mode(page, "resolve");
  await dialog.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Note deleted.");
  expect(await calls(page)).toBe(2);
});
