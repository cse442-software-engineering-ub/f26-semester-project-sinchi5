// Card 208: one account menu (Settings, Log out) and one New menu, the same on every screen size.
import { test, expect } from "./support/account-fixture";
import { accountButton, logOut } from "./support/shell";

test("the account menu has exactly Settings and Log out, and Log out from Today shows the log-in form", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await accountButton(page).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Settings", "Log out"]);
  await page.keyboard.press("Escape");
  await expect(accountButton(page)).toBeFocused();
  await logOut(page);
  await expect(page.getByRole("heading", { name: "Good to see you again." })).toBeVisible();
});

test("the New menu offers every way to start something", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Note", "Event", "Course", "Upload syllabus", "Upload document", "Scan photos"]);
});
