// Card 46: correcting detected events before adding them, against the mocked API in
// support/account-fixture.ts. No server is needed and the Gemini API is never called.
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";
import { openUpload, reviewSyllabus, signUpWithCourse, SYLLABUS, textFile } from "./support/syllabus";

const missing = (input: Locator) => input.evaluate((el) => (el as HTMLInputElement).validity.valueMissing);
async function eventOn(page: Page, date: string, title: string) {
  await page.goto(`/schedule?date=${date}`);
  return page.getByRole("button", { name: new RegExp(title.replace(/[()]/g, "\\$&")) });
}

test("Task test 1: edits to a proposed event are kept", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await reviewSyllabus(page);
  await expect(dialog.getByLabel("Course").locator("option:checked")).toHaveText("CSE 442");
  // A syllabus adds events only, so the note fields are not shown.
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("Category")).toHaveCount(0);
  await dialog.getByLabel("Event title").first().fill("Homework 1 (revised)");
  await dialog.getByLabel("Due date").first().fill("2026-09-30");
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  await expect(dialog.getByRole("heading", { name: "A little more organized." })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(await eventOn(page, "2026-09-30", "Homework 1 (revised)")).toBeVisible();
  await expect(await eventOn(page, "2026-09-28", "Homework 1")).toHaveCount(0);
});

test("Task test 2: an included event can't be added without a title or a date", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await reviewSyllabus(page);
  const title = dialog.getByLabel("Event title").first();
  const date = dialog.getByLabel("Due date").first();
  const add = dialog.getByRole("button", { name: "Add to schedule" });
  await title.fill("");
  await add.click();
  expect(await missing(title)).toBe(true);
  await expect(add).toBeVisible();
  await title.fill("Homework 1");
  await date.fill("");
  await add.click();
  expect(await missing(date)).toBe(true);
  await expect(add).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(await eventOn(page, "2026-10-14", "Midterm exam")).toHaveCount(0);
});

test("Task test 3: an event that is left out is not added", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await reviewSyllabus(page);
  const finalProject = dialog.getByRole("group").filter({ has: page.getByLabel("Event title").and(page.locator('[value="Final project"]')) });
  await finalProject.getByLabel("Include").uncheck();
  await expect(finalProject.getByLabel("Event title")).toBeDisabled();
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  await expect(dialog.getByRole("heading", { name: "A little more organized." })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(await eventOn(page, "2026-12-04", "Final project")).toHaveCount(0);
  await expect(await eventOn(page, "2026-10-14", "Midterm exam")).toBeVisible();
});

test("an event without a clear date says why and needs a date before it is added", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await reviewSyllabus(page, "Quiz next Friday\nHomework 2 due October 5, 2026");
  await expect(dialog.getByText("Some details need your attention.", { exact: false })).toBeVisible();
  await expect(dialog.getByText("Needs review: choose the date. The syllabus says “Quiz next Friday”.")).toBeVisible();
  // With no posted date it starts unchecked, so it's added only if the student chooses a date.
  await expect(dialog.getByLabel("Include").first()).not.toBeChecked();
  await expect(dialog.getByText("1 of 2 events will be added to CSE 442.")).toBeVisible();
  await dialog.getByLabel("Include").first().check();
  const date = dialog.getByLabel("Due date").first();
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  expect(await missing(date)).toBe(true);
  await date.fill("2026-10-09");
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  await expect(dialog.getByRole("heading", { name: "A little more organized." })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(await eventOn(page, "2026-10-09", "Quiz")).toBeVisible();
});

test("leaving out every event, or finding none, leaves nothing to add", async ({ page }) => {
  await signUpWithCourse(page);
  let dialog = await reviewSyllabus(page, "Homework 2 due October 5, 2026");
  await dialog.getByLabel("Include").uncheck();
  await expect(dialog.getByRole("button", { name: "Add to schedule" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Close" }).click();
  dialog = await reviewSyllabus(page, "Office hours: Mondays 2-3 PM", "no-events.txt");
  await expect(dialog.getByText("No dated events were found in this file.", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add to schedule" })).toBeDisabled();
  await expect(dialog.getByText("Include at least one event to add it to your schedule.")).toBeVisible();
});

test("a student can add an event the readers missed", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await reviewSyllabus(page);
  await expect(dialog.getByText("We found 3 events with automatic reading.", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Add an event" }).click();
  const added = dialog.getByRole("group", { name: "Added by you" });
  await expect(added.getByLabel("Event title")).toBeFocused();
  await added.getByLabel("Event title").fill("Lab 3 report");
  await added.getByLabel("Type").selectOption("deadline");
  await added.getByLabel("Due date").fill("2026-10-21");
  await expect(dialog.getByText("4 of 4 events will be added to CSE 442.")).toBeVisible();
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  await expect(dialog.getByRole("heading", { name: "A little more organized." })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(await eventOn(page, "2026-10-21", "Lab 3 report")).toBeVisible();
});

test("when a file can't be read at all, events can be typed in by hand", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await openUpload(page);
  await dialog.getByLabel("Choose upload file").setInputFiles(textFile("cse442-syllabus.txt", SYLLABUS));
  await dialog.getByText("Prototype preview options", { exact: true }).click();
  await dialog.getByRole("combobox", { name: "Processing result" }).selectOption("failure");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("button", { name: "Add events by hand" }).click();
  const added = dialog.getByRole("group", { name: "Added by you" });
  await added.getByLabel("Event title").fill("Midterm exam");
  await added.getByLabel("Type").selectOption("exam");
  await added.getByLabel("Due date").fill("2026-10-14");
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  await expect(dialog.getByRole("heading", { name: "A little more organized." })).toBeVisible();
});
