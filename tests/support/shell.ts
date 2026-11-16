// Card 208: the shell has one New menu and one account menu (Settings, Log out). Specs use these helpers.
import type { Page } from "@playwright/test";

export const accountButton = (page: Page) =>
  page.locator('button[aria-haspopup="menu"]:visible').filter({ hasNotText: /^(New|More)$/ });

export async function openNew(page: Page, item: "Note" | "Event" | "Course" | "Upload syllabus" | "Upload document" | "Scan photos") {
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

async function accountItem(page: Page, item: "Settings" | "Log out") {
  await accountButton(page).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}
export const openSettings = (page: Page) => accountItem(page, "Settings");
export const logOut = (page: Page) => accountItem(page, "Log out");
