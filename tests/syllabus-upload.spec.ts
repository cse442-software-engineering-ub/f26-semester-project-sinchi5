// Card 45: the "Upload syllabus" window for a signed-in student, against the mocked API in
// support/account-fixture.ts. No server is needed and the Gemini API is never called.
import type { Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";
import { openUpload, pdfFile, photoFile, signUpWithCourse, SYLLABUS, textFile as file } from "./support/syllabus";

// Records which API routes the page calls, to prove which files reach the server reader.
function apiRoutes(page: Page) {
  const routes: string[] = [];
  page.on("request", (request) => {
    const route = /[?&]route=([^&]+)/.exec(request.url())?.[1];
    if (route && route !== "session") routes.push(route);
  });
  return routes;
}

test("Task test 1: Continue stays greyed out until a valid file is chosen for a course", async ({ page }) => {
  await signUpWithCourse(page);
  await openUpload(page);
  const dialog = page.getByRole("dialog");
  const continueButton = dialog.getByRole("button", { name: "Continue", exact: true });
  await expect(dialog.getByText("PDF, DOCX, TXT, Markdown, or images · up to 20 MB")).toBeVisible();
  await expect(dialog.getByLabel("Course").locator("option:checked")).toHaveText("CSE 442");
  await expect(continueButton).toBeDisabled();
  await dialog.getByLabel("Choose upload file").setInputFiles(file("cse442-syllabus.txt", SYLLABUS));
  await expect(continueButton).toBeEnabled();
  // A bad choice after a good one replaces it, so Continue can't upload the earlier file.
  await dialog.getByLabel("Choose upload file").setInputFiles(file("syllabus.exe", "not a syllabus"));
  await expect(dialog.getByRole("alert")).toHaveText("Choose a PDF, DOCX, TXT, Markdown, or supported image file.");
  await expect(continueButton).toBeDisabled();
  await dialog.getByLabel("Choose upload file").setInputFiles(file("empty-syllabus.txt", ""));
  await expect(dialog.getByRole("alert")).toHaveText("This file is empty. Please choose another.");
  await expect(continueButton).toBeDisabled();
});

test("Task test 2: processing states lead to the detected events, read in the browser", async ({ page }) => {
  await signUpWithCourse(page);
  const routes = apiRoutes(page);
  await openUpload(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Choose upload file").setInputFiles(file("cse442-syllabus.txt", SYLLABUS));
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Getting your file ready…" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Finding the useful details…" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add to schedule" })).toBeVisible();
  await expect(dialog.getByLabel("Event title")).toHaveCount(3);
  await expect(dialog.getByLabel("Event title").nth(1)).toHaveValue("Midterm exam");
  await expect(dialog.getByLabel("Due date").nth(1)).toHaveValue("2026-10-14");
  await expect(dialog.getByLabel("Time").nth(1)).toHaveValue("10:00");
  // The text file is uploaded to the student's job, but never sent to the paid reader.
  expect(routes.filter((r) => r !== "notes" && r !== "events")).toEqual(["syllabus-upload"]);
});

test("Task test 3: a failed job offers Try again, which reaches the review screen", async ({ page }) => {
  await signUpWithCourse(page);
  await openUpload(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Choose upload file").setInputFiles(file("cse442-syllabus.txt", SYLLABUS));
  await dialog.getByText("Prototype preview options", { exact: true }).click();
  await dialog.getByRole("combobox", { name: "Processing result" }).selectOption("failure");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "That file needs another try" })).toBeVisible();
  await expect(dialog.getByText("We couldn’t process this upload. Your existing notes are safe.")).toBeVisible();
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.getByRole("button", { name: "Add to schedule" })).toBeVisible();
  await expect(dialog.getByLabel("Event title")).toHaveCount(3);
});

test("a PDF with clear dates is read in the browser, without the automatic reader", async ({ page }) => {
  await signUpWithCourse(page);
  const routes = apiRoutes(page);
  await openUpload(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Choose upload file").setInputFiles(pdfFile("syllabus.pdf", SYLLABUS.split("\n")));
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Add to schedule" })).toBeVisible();
  await expect(dialog.getByLabel("Event title")).toHaveCount(3);
  await expect(dialog.getByLabel("Due date").nth(2)).toHaveValue("2026-12-04");
  expect(routes.filter((r) => r !== "notes" && r !== "events")).toEqual(["syllabus-upload"]);
});

test("a photo goes to the automatic reader once, and its unclear dates are flagged", async ({ page }) => {
  await signUpWithCourse(page);
  const routes = apiRoutes(page);
  await openUpload(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Choose upload file").setInputFiles(photoFile("syllabus.png"));
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByLabel("Event title")).toHaveCount(2);
  await expect(dialog.getByLabel("Event title").first()).toHaveValue("Reading response 1");
  await expect(dialog.getByText("Some details need your attention.", { exact: false })).toBeVisible();
  expect(routes.filter((r) => r !== "notes" && r !== "events")).toEqual(["syllabus-upload", "import-extract"]);
});

test("when the automatic reader can't help, the reason is shown with what was found", async ({ page }) => {
  await signUpWithCourse(page);
  await openUpload(page);
  const dialog = page.getByRole("dialog");
  // The rules can't pair these names with dates, so they ask the automatic reader, which is at its limit.
  const split = [...SYLLABUS.split("\n"), "Midterm exam 2", "Quiz 3", "Project 2 due", "Final exam", "Oct 30 Nov 13 Dec 1 Dec 10"];
  await dialog.getByLabel("Choose upload file").setInputFiles(file("limit.txt", split.join("\n")));
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Add to schedule" })).toBeVisible();
  await expect(dialog.getByText("You can read 5 syllabi automatically each day. Try again tomorrow. "
    + "Check these events against your syllabus, and add any that are missing.")).toBeVisible();
  await expect(dialog.getByLabel("Event title").first()).toHaveValue("Homework 1");
});

test("a renamed or damaged file is named for what it is before anything uploads", async ({ page }) => {
  await signUpWithCourse(page);
  const routes = apiRoutes(page);
  await openUpload(page);
  const dialog = page.getByRole("dialog");
  const continueButton = dialog.getByRole("button", { name: "Continue", exact: true });
  await dialog.getByLabel("Choose upload file").setInputFiles({ ...photoFile("syllabus.pdf"), mimeType: "application/pdf" });
  await expect(dialog.getByRole("alert")).toHaveText(
    "This file is named .pdf, but it is really a PNG image. Rename it to end in .png, then choose it again.");
  await expect(continueButton).toBeDisabled();
  await expect(dialog.getByText("Choose a file to continue.")).toBeVisible();
  const cut = pdfFile("cut.pdf", ["Quiz 1 on September 8"]);
  await dialog.getByLabel("Choose upload file").setInputFiles({ ...cut, buffer: cut.buffer.subarray(0, 120) });
  await expect(dialog.getByRole("alert")).toHaveText("This PDF looks cut off. Download it again, then upload the new copy.");
  await expect(continueButton).toBeDisabled();
  expect(routes.filter((r) => r !== "notes" && r !== "events")).toEqual([]);
});

test("each screen shows which step the student is on and what comes next", async ({ page }) => {
  await signUpWithCourse(page);
  await openUpload(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("list", { name: "Step 1 of 4" })).toBeVisible();
  await expect(dialog.getByText("The syllabus’s dates go on this course’s schedule.")).toBeVisible();
  await dialog.getByLabel("Choose upload file").setInputFiles(file("cse442-syllabus.txt", SYLLABUS));
  await expect(dialog.getByText("Next: Notely reads cse442-syllabus.txt.")).toBeVisible();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByRole("list", { name: "Step 3 of 4" })).toBeVisible();
});
