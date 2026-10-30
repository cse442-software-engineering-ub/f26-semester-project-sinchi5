// Card 48: confirming imported events and finding them in the schedule, against the mocked API in
// support/account-fixture.ts. No server is needed and the Gemini API is never called.
import { test, expect } from "./support/account-fixture";
import { reviewSyllabus, signUpWithCourse, SYLLABUS } from "./support/syllabus";

const TASK_48_SYLLABUS = `${SYLLABUS}\nHomework 3 due November 6, 2026 at 11:59 PM`;

test("Task tests 1 and 2: the confirmation links to imported events, labeled with their course", async ({ page }) => {
  await signUpWithCourse(page);
  const confirms: string[] = [];
  page.on("request", (request) => { if (request.url().includes("route=import-confirm")) confirms.push(request.url()); });
  const dialog = await reviewSyllabus(page, TASK_48_SYLLABUS);
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  await expect(dialog.getByRole("heading", { name: "A little more organized." })).toBeVisible();
  await expect(dialog.getByText("Your reviewed events are in your schedule.")).toBeVisible();
  await expect(dialog.getByText("Added 4 events to CSE 442.")).toBeVisible();
  await dialog.getByRole("link", { name: "View schedule" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/schedule\?date=2026-09-28$/);
  await expect(page.getByRole("button", { name: /Homework 1.*assignment · CSE 442 · Imported/ })).toBeVisible();

  // Phones open the schedule as an agenda without month arrows, so each day is opened by its date.
  await page.goto("/schedule?date=2026-10-14");
  await expect(page.getByRole("button", { name: /10:00 AM.*Midterm exam.*exam · CSE 442 · Imported/ })).toBeVisible();
  await page.goto("/schedule?date=2026-12-04");
  await expect(page.getByRole("button", { name: /Final project.*deadline · CSE 442 · Imported/ })).toBeVisible();
  expect(confirms).toHaveLength(1);
});

test("View schedule is the main button", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await reviewSyllabus(page);
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  const view = dialog.getByRole("link", { name: "View schedule" });
  const done = dialog.getByRole("button", { name: "All done" });
  await expect(view).toHaveClass(/primary/);
  await expect(done).toHaveClass(/secondary/);
  const viewStyle = await view.evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    fontSize: parseFloat(getComputedStyle(el).fontSize),
    height: el.getBoundingClientRect().height,
    beforeDone: el.nextElementSibling?.textContent?.trim() === "All done",
  }));
  const doneStyle = await done.evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    fontSize: parseFloat(getComputedStyle(el).fontSize),
    height: el.getBoundingClientRect().height,
    borderWidth: parseFloat(getComputedStyle(el).borderTopWidth),
  }));
  expect(viewStyle.background).not.toBe(doneStyle.background);
  expect(viewStyle.height).toBeGreaterThanOrEqual(44);
  expect(viewStyle.height).toBeGreaterThanOrEqual(doneStyle.height);
  expect(viewStyle.fontSize).toBeGreaterThanOrEqual(doneStyle.fontSize);
  expect(doneStyle.borderWidth).toBeGreaterThan(0);
  expect(viewStyle.beforeDone).toBe(true);
  const viewBox = (await view.boundingBox())!;
  const doneBox = (await done.boundingBox())!;
  expect(Math.abs(viewBox.y - doneBox.y)).toBeLessThan(1);
  expect(viewBox.x + viewBox.width).toBeLessThan(doneBox.x);
  expect(doneBox.x + doneBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("shows due times in the month calendar and day list", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await reviewSyllabus(page, TASK_48_SYLLABUS);
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  await dialog.getByRole("link", { name: "View schedule" }).click();

  await page.goto("/schedule?date=2026-11-06&view=month");
  await expect(page.locator('button[aria-label^="Fri Nov 06 2026"]')).toContainText("11:59 PM assignment: Homework 3");
  await expect(page.getByRole("button", { name: /Homework 3.*Imported/ })).toContainText("11:59 PM");

  await page.goto("/schedule?date=2026-10-14&view=month");
  await expect(page.locator('button[aria-label^="Wed Oct 14 2026"]')).toContainText("10:00 AM exam: Midterm exam");
  await expect(page.getByRole("button", { name: /Midterm exam.*Imported/ })).toContainText("10:00 AM");

  await page.goto("/schedule?date=2026-12-04&view=month");
  const finalSquare = page.locator('button[aria-label^="Fri Dec 04 2026"]');
  await expect(finalSquare).toContainText("deadline: Final project");
  await expect(finalSquare).not.toContainText("All day");
  await expect(page.getByRole("button", { name: /Final project.*Imported/ })).toContainText("All day");

  for (const [date, title, time, display] of [
    ["2026-11-07", "Midnight check", "00:00", "12:00 AM"],
    ["2026-11-08", "Noon check", "12:00", "12:00 PM"],
  ]) {
    await page.goto(`/schedule?date=${date}&view=month`);
    await page.getByRole("button", { name: "Add event" }).click();
    const eventDialog = page.getByRole("dialog", { name: "Make room for what’s next" });
    await eventDialog.getByLabel("Title").fill(title);
    await eventDialog.getByLabel("Time").fill(time);
    await eventDialog.getByRole("button", { name: "Create event" }).click();
    await expect(eventDialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: new RegExp(title) })).toContainText(display);
    const day = new Date(`${date}T12:00:00`).toDateString();
    await expect(page.locator(`button[aria-label^="${day}"]`)).toContainText(`${display} lecture: ${title}`);
  }
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
