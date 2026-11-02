// Card 46: correcting detected events before adding them, against the mocked API in
// support/account-fixture.ts. No server is needed and the Gemini API is never called.
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";
import { LECTURE, openUpload, readOf, reviewSyllabus, section, signUpWithCourse, SYLLABUS, textFile } from "./support/syllabus";

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
  // With no posted date it starts unchecked, so it's added only if the student chooses a date.
  await expect(dialog.getByText("No date is posted for this, so it won’t be added unless you include it and choose one. The syllabus says “Quiz next Friday”.")).toBeVisible();
  await expect(dialog.getByLabel("Include").first()).not.toBeChecked();
  await expect(dialog.getByText("1 of 2 events will be added to CSE 442.")).toBeVisible();
  await dialog.getByLabel("Include").first().check();
  await expect(dialog.getByText("Needs review: choose the date. The syllabus says “Quiz next Friday”.")).toBeVisible();
  const date = dialog.getByLabel("Due date").first();
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  expect(await missing(date)).toBe(true);
  await date.fill("2026-10-09");
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  await expect(dialog.getByRole("heading", { name: "A little more organized." })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(await eventOn(page, "2026-10-09", "Quiz")).toBeVisible();
});

test("leaving out every event leaves nothing to add", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await reviewSyllabus(page, "Homework 2 due October 5, 2026");
  await dialog.getByLabel("Include").uncheck();
  await expect(dialog.getByRole("button", { name: "Add to schedule" })).toBeDisabled();
  await expect(dialog.getByText("Include at least one to add it to your schedule.")).toBeVisible();
});

// Waits for the screen that follows a read, whichever one it is.
async function upload(page: Page, text: string, name = "syllabus.txt") {
  const dialog = await openUpload(page);
  await dialog.getByLabel("Choose upload file").setInputFiles(textFile(name, text));
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  return dialog;
}

test("a syllabus with no events says so, adds nothing, and offers the next steps", async ({ page }) => {
  await signUpWithCourse(page);
  const confirms: string[] = [];
  page.on("request", (request) => { if (request.url().includes("route=import-confirm")) confirms.push(request.url()); });
  const dialog = await upload(page, "CSE 250 Data Structures\nGrading: two midterm exams 30%, final exam 30%.", "cse250-no-events.txt");
  await expect(dialog.getByRole("heading", { name: "No class times or due dates found" })).toBeVisible();
  await expect(dialog.getByText("We read cse250-no-events.txt, but it doesn’t list weekly classes or dated work. Nothing was added to your schedule.")).toBeVisible();
  // Nothing greyed out or half-finished: no form, and no button that can't be used.
  await expect(dialog.getByRole("button", { name: "Add to schedule" })).toHaveCount(0);
  await expect(dialog.getByLabel("Event title")).toHaveCount(0);

  // Add events by hand opens an event to fill in, and it can be saved.
  await dialog.getByRole("button", { name: "Add events by hand" }).click();
  const added = dialog.getByRole("group", { name: "Added by you" });
  await expect(added.getByLabel("Event title")).toBeFocused();
  await added.getByLabel("Event title").fill("Midterm exam");
  await added.getByLabel("Type").selectOption("exam");
  await added.getByLabel("Due date").fill("2026-10-14");
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  await expect(dialog.getByRole("heading", { name: "A little more organized." })).toBeVisible();
  expect(confirms).toHaveLength(1);
  await dialog.getByRole("button", { name: "All done" }).click();
  await expect(await eventOn(page, "2026-10-14", "Midterm exam")).toBeVisible();
});

test("from the no-events screen, a student can choose another file or simply close", async ({ page }) => {
  await signUpWithCourse(page);
  const confirms: string[] = [];
  page.on("request", (request) => { if (request.url().includes("route=import-confirm")) confirms.push(request.url()); });
  const dialog = await upload(page, "CSE 250 Data Structures");
  await dialog.getByRole("button", { name: "Choose a different file" }).click();
  await dialog.getByLabel("Choose upload file").setInputFiles(textFile("cse442-syllabus.txt", SYLLABUS));
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByLabel("Event title")).toHaveCount(3);
  await dialog.getByRole("button", { name: "Close" }).click();

  const again = await upload(page, "CSE 250 Data Structures");
  await again.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(confirms).toHaveLength(0);
});

test("a file that isn't a syllabus says so and adds nothing", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await upload(page, readOf({ isSyllabus: false }), "resume.txt");
  await expect(dialog.getByRole("heading", { name: "This doesn’t look like a syllabus" })).toBeVisible();
  await expect(dialog.getByText("resume.txt doesn’t look like a course syllabus. Nothing was added to your schedule.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add events by hand" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Choose a different file" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add to schedule" })).toHaveCount(0);
});

test("a syllabus with only dates, or only classes, shows what it has and says what it doesn't", async ({ page }) => {
  await signUpWithCourse(page);
  let dialog = await reviewSyllabus(page);
  await expect(dialog.getByText("We didn’t find weekly class times in this file.")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Your classes" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close" }).click();
  dialog = await reviewSyllabus(page, readOf({ meetings: [LECTURE] }), "classes-only.txt");
  await expect(dialog.getByText("We found 1 weekly class.", { exact: false })).toBeVisible();
  await expect(dialog.getByText("We didn’t find any dated work in this file.")).toBeVisible();
  await expect(dialog.getByText("1 weekly class will be added to CSE 442.")).toBeVisible();
});

test("weekly classes are listed first, with their days, time, room, and dates", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await reviewSyllabus(page, readOf({ meetings: [LECTURE], noClassDates: [{ from: "2026-08-26", to: "2026-08-26" }, { from: "2026-11-23", to: "2026-11-27" }],
    events: [{ title: "Midterm exam", kind: "exam", date: "2026-10-14", time: "10:00", location: "Davis 101", source: "Midterm exam, in class" }] }), "weekly.txt");
  await expect(dialog.getByText("We found 1 weekly class and 1 event.", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Your classes" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Due dates and exams" })).toBeVisible();
  await expect(dialog.getByText("No class on Aug 26, Nov 23–Nov 27, from your syllabus.")).toBeVisible();
  const lecture = dialog.getByRole("group", { name: "Detected lecture" });
  await expect(lecture.getByLabel("Include Lecture")).toBeChecked();
  await expect(lecture.getByText("Mon Wed · 10:00 AM · Davis 101")).toBeVisible();
  await expect(lecture.getByLabel("Class name")).toHaveValue("Lecture");
  await expect(lecture.getByLabel("Type")).toHaveValue("lecture");
  await expect(lecture.getByRole("button", { name: "Monday" })).toHaveAttribute("aria-pressed", "true");
  await expect(lecture.getByRole("button", { name: "Wednesday" })).toHaveAttribute("aria-pressed", "true");
  await expect(lecture.getByRole("button", { name: "Friday" })).toHaveAttribute("aria-pressed", "false");
  await expect(lecture.getByLabel("Time")).toHaveValue("10:00");
  await expect(lecture.getByLabel("Room")).toHaveValue("Davis 101");
  await expect(lecture.getByLabel("Starts")).toHaveValue("2026-08-24");
  await expect(lecture.getByLabel("Ends")).toHaveValue("2026-09-04");
  await expect(dialog.getByText("1 weekly class and 1 of 1 event will be added to CSE 442.")).toBeVisible();
});

test("several sections start unchecked, and only the one the student picks is added", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await reviewSyllabus(page, readOf({ meetings: [LECTURE, section("R1", [2], "13:00", "Knox 14"), section("R2", [4], "15:00", "Knox 20")] }), "sections.txt");
  await expect(dialog.getByText("Pick your recitation section")).toBeVisible();
  await expect(dialog.getByLabel("Include Lecture")).toBeChecked();
  const r1 = dialog.getByLabel("Include Recitation R1");
  const r2 = dialog.getByLabel("Include Recitation R2");
  await expect(r1).not.toBeChecked();
  await expect(r2).not.toBeChecked();
  // Left out, a section is one line, so a long list stays easy to scan.
  await expect(dialog.getByText("Tue · 1:00 PM · Knox 14")).toBeVisible();
  await expect(dialog.getByLabel("Class name")).toHaveCount(1);
  await expect(dialog.getByText("1 weekly class will be added to CSE 442.")).toBeVisible();
  await r2.check();
  await expect(dialog.getByLabel("Class name")).toHaveCount(2);
  await expect(dialog.getByText("2 weekly classes will be added to CSE 442.")).toBeVisible();
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  await expect(dialog.getByRole("heading", { name: "A little more organized." })).toBeVisible();
  await dialog.getByRole("button", { name: "All done" }).click();
  // Aug 27 is a Thursday, when only R2 meets; Aug 25 is a Tuesday, when only R1 would have.
  await expect(await eventOn(page, "2026-08-27", "CSE 442 Recitation R2")).toBeVisible();
  await expect(await eventOn(page, "2026-08-25", "CSE 442 Recitation R1")).toHaveCount(0);
});

test("a weekly class goes on each of its days with its room, and skips days with no class", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await reviewSyllabus(page, readOf({ meetings: [LECTURE], noClassDates: [{ from: "2026-08-26", to: "2026-08-26" }] }), "weekly.txt");
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  await expect(dialog.getByRole("heading", { name: "A little more organized." })).toBeVisible();
  await dialog.getByRole("button", { name: "All done" }).click();
  for (const date of ["2026-08-24", "2026-08-31", "2026-09-02"]) {
    await expect(await eventOn(page, date, "CSE 442 Lecture")).toContainText("10:00 AM");
    await expect(await eventOn(page, date, "CSE 442 Lecture")).toContainText("lecture · CSE 442 · Davis 101 · Imported");
  }
  // Tuesday, a skipped Wednesday, a Friday, and the day after the last class.
  for (const date of ["2026-08-25", "2026-08-26", "2026-08-28", "2026-09-07"]) await expect(await eventOn(page, date, "CSE 442 Lecture")).toHaveCount(0);
});

test("a weekly class can be corrected, and bad days or dates are refused before anything is saved", async ({ page }) => {
  await signUpWithCourse(page);
  const confirms: string[] = [];
  page.on("request", (request) => { if (request.url().includes("route=import-confirm")) confirms.push(request.url()); });
  const dialog = await reviewSyllabus(page, readOf({ meetings: [LECTURE] }), "weekly.txt");
  const lecture = dialog.getByRole("group", { name: "Detected lecture" });
  const add = dialog.getByRole("button", { name: "Add to schedule" });

  await lecture.getByRole("button", { name: "Monday" }).click();
  await lecture.getByRole("button", { name: "Wednesday" }).click();
  await add.click();
  await expect(dialog.getByRole("alert")).toHaveText("Lecture: Choose at least one day.");
  await lecture.getByRole("button", { name: "Friday" }).click();
  await expect(lecture.getByRole("button", { name: "Friday" })).toHaveAttribute("aria-pressed", "true");

  await lecture.getByLabel("Ends").fill("2026-08-24");
  await add.click();
  await expect(dialog.getByRole("alert")).toHaveText("Lecture: Choose an end date after the start date.");
  await lecture.getByLabel("Ends").fill("2028-01-01");
  await add.click();
  await expect(dialog.getByRole("alert")).toHaveText("Lecture: Repeating events can run for at most one year.");
  await lecture.getByLabel("Ends").fill("");
  await add.click();
  expect(await missing(lecture.getByLabel("Ends"))).toBe(true);
  expect(confirms).toHaveLength(0);

  await lecture.getByLabel("Ends").fill("2026-09-04");
  await lecture.getByLabel("Class name").fill("Studio");
  await lecture.getByLabel("Time").fill("14:00");
  await lecture.getByLabel("Room").fill("Knox 5");
  await lecture.getByLabel("Type").selectOption("lab");
  await add.click();
  await expect(dialog.getByRole("heading", { name: "A little more organized." })).toBeVisible();
  await dialog.getByRole("button", { name: "All done" }).click();
  const friday = await eventOn(page, "2026-08-28", "CSE 442 Studio");
  await expect(friday).toContainText("2:00 PM");
  await expect(friday).toContainText("lab · CSE 442 · Knox 5");
  await expect(await eventOn(page, "2026-08-24", "CSE 442 Studio")).toHaveCount(0);
});

test("a syllabus's class dates come first, then the course's, and with neither the student is asked", async ({ page }) => {
  await signUpWithCourse(page, "notely-class-dates@example.edu", { start: "2026-08-31", end: "2026-12-11" });
  const undated = { ...LECTURE, firstDate: "", lastDate: "" };
  let dialog = await reviewSyllabus(page, readOf({ meetings: [undated] }), "no-dates.txt");
  await expect(dialog.getByLabel("Starts")).toHaveValue("2026-08-31");
  await expect(dialog.getByLabel("Ends")).toHaveValue("2026-12-11");
  await expect(dialog.getByText("Needs review: choose when this class starts and ends.")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close" }).click();
  dialog = await reviewSyllabus(page, readOf({ meetings: [LECTURE] }), "with-dates.txt");
  await expect(dialog.getByLabel("Starts")).toHaveValue("2026-08-24");
  await expect(dialog.getByLabel("Ends")).toHaveValue("2026-09-04");
  await dialog.getByRole("button", { name: "Close" }).click();

  // A course from before these fields, or one left blank, falls to the student.
  await page.goto("/");
  await page.getByRole("button", { name: "Add course", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add a course" });
  await add.getByLabel("Course code").fill("CSE 250");
  await add.getByLabel("Course name").fill("Data Structures");
  await add.getByRole("button", { name: "Add course" }).click();
  await expect(add).toHaveCount(0);
  const open = await openUpload(page);
  await open.getByLabel("Course").selectOption({ label: "CSE 250" });
  await open.getByLabel("Choose upload file").setInputFiles(textFile("no-dates.txt", readOf({ meetings: [undated] })));
  await open.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(open.getByText("Needs review: choose when this class starts and ends.")).toBeVisible();
  await expect(open.getByText("Some details need your attention.", { exact: false })).toBeVisible();
  await open.getByRole("button", { name: "Add to schedule" }).click();
  expect(await missing(open.getByLabel("Starts"))).toBe(true);
});

test("class dates on a course are optional, and an end before the start is refused", async ({ page }) => {
  await signUpWithCourse(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Add course", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add a course" });
  await add.getByLabel("Course code").fill("CSE 250");
  await add.getByLabel("Course name").fill("Data Structures");
  await add.getByLabel("Classes start").fill("2026-12-11");
  await add.getByLabel("Classes end").fill("2026-08-31");
  await add.getByRole("button", { name: "Add course" }).click();
  await expect(add.getByRole("alert")).toHaveText("Choose a class end date after the start date.");
  await add.getByLabel("Classes end").fill("2026-12-18");
  await add.getByRole("button", { name: "Add course" }).click();
  await expect(add).toHaveCount(0);
});

test("a student can add an event the readers missed", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await reviewSyllabus(page);
  await expect(dialog.getByText("We found 3 events.", { exact: false })).toBeVisible();
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

test("the review and no-events screens have no accessibility problems and work by keyboard", async ({ page }) => {
  await signUpWithCourse(page);
  const dialog = await reviewSyllabus(page, readOf({ noClassDates: [{ from: "2026-08-26", to: "2026-08-26" }], meetings: [LECTURE, section("R1", [2], "13:00", "Knox 14"), section("R2", [4], "15:00", "Knox 20")],
    events: [{ title: "Final exam", kind: "exam", date: "", time: "", location: "", source: "Final exam: TBA" }] }), "weekly.txt");
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  // Each day is a large enough target and can be pressed from the keyboard.
  const friday = dialog.getByRole("button", { name: "Friday" });
  const box = (await friday.boundingBox())!;
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  await friday.focus();
  await page.keyboard.press("Space");
  await expect(friday).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Close" }).click();

  const empty = await upload(page, "CSE 250 Data Structures", "cse250.txt");
  await expect(empty.getByRole("heading", { name: "No class times or due dates found" })).toBeVisible();
  const emptyResults = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(emptyResults.violations.map((v) => v.id)).toEqual([]);
});
