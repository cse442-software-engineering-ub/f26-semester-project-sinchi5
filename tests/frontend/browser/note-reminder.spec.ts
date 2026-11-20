import type { Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";

const password = "Sample river password 42!";
const summary = (page: Page) => page.getByText(/^Reminder: /);
const dialog = (page: Page) => page.getByRole("dialog", { name: "Reminder" });

// Phones keep Reminder in the note's "More actions" menu (card 242); wider screens show the button.
// Clicking (not forcing) the control proves nothing covers it.
async function reminderControl(page: Page) {
  const more = page.getByRole("button", { name: "More actions" });
  if (await more.isVisible()) {
    await more.click();
    return page.getByRole("menuitem", { name: "Reminder" });
  }
  return page.getByRole("button", { name: "Reminder", exact: true });
}

async function openReminder(page: Page) {
  await (await reminderControl(page)).click();
}

async function openNote(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Your name").fill("Reminder Student");
  await page.getByLabel("Email address").fill("notely-reminder-442@example.edu");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.goto("/notes");
  await page.getByRole("button", { name: "Create Note" }).click();
  const create = page.getByRole("dialog", { name: "Create Note" });
  await create.getByLabel("Note title").fill("Submit lab report");
  await create.getByRole("button", { name: "Close" }).click();
  await page.getByRole("heading", { name: "Submit lab report" }).click();
  await expect(page.getByLabel("Note title")).toHaveValue("Submit lab report");
}

async function choose(page: Page, date: string, time: string) {
  await openReminder(page);
  await dialog(page).getByLabel("Date").fill(date);
  await dialog(page).getByLabel("Time").fill(time);
  await dialog(page).getByRole("button", { name: "Set reminder" }).click();
  await expect(dialog(page)).toBeHidden();
}

function localFields(date: Date) {
  return {
    day: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
  };
}

test("Card 76: set, change, and remove a reminder across reload", async ({ page }) => {
  await openNote(page);
  const tomorrow = new Date(Date.now() + 86_400_000);
  const { day } = localFields(tomorrow);
  await choose(page, day, "09:00");
  await expect(summary(page)).toContainText(`${day} at 9:00 AM`);
  await choose(page, day, "10:30");
  await expect(summary(page)).toContainText(`${day} at 10:30 AM`);
  await page.reload();
  await expect(summary(page)).toContainText(`${day} at 10:30 AM`);
  await openReminder(page);
  await expect(dialog(page).getByLabel("Time")).toHaveValue("10:30");
  await dialog(page).getByRole("button", { name: "Remove reminder" }).click();
  await expect(summary(page)).toHaveCount(0);
  await page.reload();
  await expect(summary(page)).toHaveCount(0);
});

test("Story 18: a past time is rejected without changing the saved reminder", async ({ page }) => {
  await openNote(page);
  const tomorrow = localFields(new Date(Date.now() + 86_400_000));
  await choose(page, tomorrow.day, "09:00");
  const before = await summary(page).innerText();
  await openReminder(page);
  await dialog(page).getByLabel("Date").fill(localFields(new Date(Date.now() - 86_400_000)).day);
  await dialog(page).getByRole("button", { name: "Set reminder" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("Choose a time in the future.");
  await expect(summary(page)).toHaveText(before);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await page.reload();
  await expect(summary(page)).toHaveText(before);
});

test("Story 18: due notification uses the note title and removing cancels it", async ({ page }) => {
  await page.addInitScript(() => {
    const notifications: string[] = [];
    Object.defineProperty(window, "reminderNotifications", { value: notifications });
    class FakeNotification {
      static permission = "granted";
      static requestPermission = async () => "granted";
      constructor(title: string) { notifications.push(title); }
    }
    Object.defineProperty(window, "Notification", { value: FakeNotification, configurable: true });
  });
  await openNote(page);
  await page.clock.install();
  const first = localFields(new Date(Date.now() + 4 * 60_000));
  await choose(page, first.day, first.time);
  await page.clock.fastForward(5 * 60_000);
  await expect.poll(() => page.evaluate(() => (window as Window & { reminderNotifications: string[] }).reminderNotifications))
    .toEqual(["Submit lab report"]);

  const second = localFields(new Date(Date.now() + 10 * 60_000));
  await choose(page, second.day, second.time);
  await openReminder(page);
  await dialog(page).getByRole("button", { name: "Remove reminder" }).click();
  await expect(summary(page)).toHaveCount(0);
  await page.clock.fastForward(11 * 60_000);
  await expect.poll(() => page.evaluate(() => (window as Window & { reminderNotifications: string[] }).reminderNotifications))
    .toEqual(["Submit lab report"]);
});

test("Card 76: reminder controls fit and remain usable on a phone", async ({ page }) => {
  await openNote(page);
  const control = await reminderControl(page);
  await expect(control).toBeInViewport();
  await control.click();
  await expect(dialog(page).getByLabel("Date")).toBeInViewport();
  await expect(dialog(page).getByLabel("Time")).toBeInViewport();
  await expect(dialog(page).getByRole("button", { name: "Set reminder" })).toBeInViewport();
});
