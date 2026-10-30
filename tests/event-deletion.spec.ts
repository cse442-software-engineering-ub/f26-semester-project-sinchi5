// Card 173: deleting an event from Event details, against the mocked API in support/account-fixture.ts.
import { test, expect } from "./support/account-fixture";
import type { Page } from "@playwright/test";
import { reviewSyllabus, signUpWithCourse } from "./support/syllabus";

const NOV_5 = "/schedule?date=2026-11-05";

async function addEvent(page: Page, title: string, kind: string, time: string) {
  await page.goto(NOV_5);
  await page.getByRole("button", { name: "Add event" }).click();
  const dialog = await opened(page, "Make room for what’s next");
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Course").selectOption({ label: "Personal" });
  await dialog.getByLabel("Event type").selectOption(kind);
  await dialog.getByLabel("Date").fill("2026-11-05");
  await dialog.getByLabel("Time").fill(time);
  await dialog.getByRole("button", { name: "Create event" }).click();
  await expect(dialog).toHaveCount(0);
}
async function signUpWithEvents(page: Page) {
  await signUpWithCourse(page, "notely-event-delete-173@example.edu");
  await addEvent(page, "Study group", "other", "18:00");
  await addEvent(page, "Assignment draft", "deadline", "23:59");
}
// Saves Quiz 1 (November 12) and Project draft (November 19) through the syllabus upload.
async function importQuiz(page: Page) {
  const dialog = await reviewSyllabus(page, [
    "CSE 442 Fall 2026 Syllabus", "Quiz 1 due November 12, 2026", "Project draft due November 19, 2026",
  ].join("\n"), "deletion-test-syllabus.txt");
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  await dialog.getByRole("button", { name: "All done" }).click();
}
// Waits until a window has finished sliding in (phones show windows as sheets that slide up), the
// way a person would, so a tap doesn't land on the window underneath while it is still moving.
async function opened(page: Page, name: string) {
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  await dialog.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  return dialog;
}
// A day-list row is named by its time ("18:00" or "All day"), then its title.
const row = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(`^(All day|\\d{1,2}:\\d{2}) ${title} `) });
function countDeletes(page: Page) {
  const deletes: string[] = [];
  page.on("request", (request) => { if (request.url().includes("route=event-delete")) deletes.push(request.postData() ?? ""); });
  return deletes;
}

test("Task test 4 - Delete is offered only for an existing event", async ({ page }) => {
  await signUpWithEvents(page);
  await page.getByRole("button", { name: "Add event" }).click();
  const create = await opened(page, "Make room for what’s next");
  await expect(create.getByRole("button", { name: "Create event" })).toBeVisible();
  await expect(create.getByRole("button", { name: "Delete event" })).toHaveCount(0);
  await create.getByRole("button", { name: "Close" }).click();

  await row(page, "Study group").click();
  const details = await opened(page, "Event details");
  await details.getByRole("button", { name: "Delete event" }).click();
  const confirm = await opened(page, "Delete this event?");
  await expect(confirm.getByText("Study group will be removed from your schedule.")).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Delete event" })).toBeVisible();
});

test("Task test 4 - Cancel and Escape keep the event and return to Event details", async ({ page }) => {
  await signUpWithEvents(page);
  await importQuiz(page);
  const deletes = countDeletes(page);
  await page.goto("/schedule?date=2026-11-12");
  await row(page, "Quiz 1").click();
  const details = await opened(page, "Event details");
  const open = details.getByRole("button", { name: "Delete event" });
  await open.click();
  await (await opened(page, "Delete this event?")).getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Delete this event?" })).toHaveCount(0);
  await expect(details).toBeVisible();

  await open.click();
  await opened(page, "Delete this event?");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Delete this event?" })).toHaveCount(0);
  await expect(details).toBeVisible();
  await expect(open).toBeFocused();

  await details.getByRole("button", { name: "Close" }).click();
  await expect(row(page, "Quiz 1")).toBeVisible();
  expect(deletes).toHaveLength(0);
});

test("Task test 5 - confirming deletes only that event, from the day list and the calendar", async ({ page }) => {
  await signUpWithEvents(page);
  await row(page, "Study group").click();
  await (await opened(page, "Event details")).getByRole("button", { name: "Delete event" }).click();
  await (await opened(page, "Delete this event?")).getByRole("button", { name: "Delete event" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row(page, "Study group")).toHaveCount(0);
  await expect(row(page, "Assignment draft")).toBeVisible();
  await expect(page).toHaveURL(/date=2026-11-05/);
  const square = page.getByRole("button", { name: /Nov 05 2026, 1 events/ });
  if (await square.isVisible()) {
    await expect(square).toContainText("Assignment draft");
    await expect(square).not.toContainText("Study group");
  }
  await page.reload();
  await expect(row(page, "Assignment draft")).toBeVisible();
  await expect(row(page, "Study group")).toHaveCount(0);
});

test("Task test 5 - a deleted syllabus event is gone after a reload", async ({ page }) => {
  await signUpWithEvents(page);
  await importQuiz(page);
  const deletes = countDeletes(page);
  await page.goto("/schedule?date=2026-11-12");
  await row(page, "Quiz 1").click();
  await (await opened(page, "Event details")).getByRole("button", { name: "Delete event" }).click();
  await (await opened(page, "Delete this event?")).getByRole("button", { name: "Delete event" }).click();
  // The page behind an open window is hidden from row lookups, so wait for the windows to close.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row(page, "Quiz 1")).toHaveCount(0);
  expect(deletes).toHaveLength(1);
  // Wait for the reloaded schedule's events, so "gone" isn't just "not loaded yet".
  await Promise.all([page.waitForResponse(/route=events/), page.reload()]);
  await expect(page.getByRole("heading", { name: "November 12" })).toBeVisible();
  await expect(row(page, "Quiz 1")).toHaveCount(0);
  await page.goto("/schedule?date=2026-11-19");
  await expect(row(page, "Project draft")).toBeVisible();
  expect(deletes).toHaveLength(1);
});

test("Task test 5 - one request while deleting, and a failure keeps the event", async ({ page }) => {
  await signUpWithEvents(page);
  await importQuiz(page);
  const deletes = countDeletes(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/index.php?route=event-delete", async (route) => {
    await held;
    await route.fulfill({ status: 503, json: { error: "Uploads are unavailable right now. Please try again later." } });
  });
  await page.goto("/schedule?date=2026-11-12");
  await row(page, "Quiz 1").click();
  await (await opened(page, "Event details")).getByRole("button", { name: "Delete event" }).click();
  const confirm = await opened(page, "Delete this event?");
  await confirm.getByRole("button", { name: "Delete event" }).click();
  const deleting = confirm.getByRole("button", { name: "Deleting…" });
  await expect(deleting).toBeDisabled();
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await deleting.click({ force: true });
  await expect.poll(() => deletes.length).toBe(1);
  release();
  await expect(confirm.getByRole("alert")).toHaveText("Could not delete this event. Please try again.");
  await expect(confirm.getByRole("button", { name: "Delete event" })).toBeEnabled();
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeEnabled();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("dialog", { name: "Event details" }).getByRole("button", { name: "Close" }).click();
  await expect(row(page, "Quiz 1")).toBeVisible();
  expect(deletes).toHaveLength(1);
});

test("Task test 6 - a signed-out visitor gets the sign-in screen, not the schedule", async ({ page }) => {
  const deletes = countDeletes(page);
  await page.goto("/schedule");
  await expect(page.getByText("Good to see you again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add event" })).toHaveCount(0);
  expect(deletes).toHaveLength(0);
});
