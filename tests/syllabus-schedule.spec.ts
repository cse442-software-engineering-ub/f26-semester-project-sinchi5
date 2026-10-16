// Card 48: confirming imported events and finding them in the schedule, against the mocked API in
// support/account-fixture.ts. No server is needed and the Gemini API is never called.
import { test, expect } from "./support/account-fixture";
import { reviewSyllabus, signUpWithCourse } from "./support/syllabus";

test("Task tests 1 and 2: the confirmation links to imported events, labeled with their course", async ({ page }) => {
  await signUpWithCourse(page);
  const confirms: string[] = [];
  page.on("request", (request) => { if (request.url().includes("route=import-confirm")) confirms.push(request.url()); });
  const dialog = await reviewSyllabus(page);
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  await expect(dialog.getByRole("heading", { name: "A little more organized." })).toBeVisible();
  await expect(dialog.getByText("Your reviewed events are in your schedule.")).toBeVisible();
  await expect(dialog.getByText("Added 3 events to CSE 442.")).toBeVisible();
  await dialog.getByRole("link", { name: "View schedule" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/schedule\?date=2026-09-28$/);
  await expect(page.getByRole("button", { name: /Homework 1.*assignment · CSE 442 · Imported/ })).toBeVisible();

  // Phones open the schedule as an agenda without month arrows, so each day is opened by its date.
  await page.goto("/schedule?date=2026-10-14");
  await expect(page.getByRole("button", { name: /10:00.*Midterm exam.*exam · CSE 442 · Imported/ })).toBeVisible();
  await page.goto("/schedule?date=2026-12-04");
  await expect(page.getByRole("button", { name: /Final project.*deadline · CSE 442 · Imported/ })).toBeVisible();
  expect(confirms).toHaveLength(1);
});

test("imported events come from the server, so they survive a reload without duplicates", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await reviewSyllabus(page);
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  await dialog.getByRole("button", { name: "All done" }).click();
  // Browser storage is cleared, so only the server can supply the events after the reload.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith("notely-workspace-v1-")) {
      const data = JSON.parse(localStorage.getItem(key)!);
      localStorage.setItem(key, JSON.stringify({ ...data, events: [] }));
    }
  });
  await page.goto("/schedule?date=2026-10-14");
  await expect(page.getByRole("button", { name: /Midterm exam.*Imported/ })).toHaveCount(1);
});
