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

test("Task test 2: processing states lead to the detected events, read on the server", async ({ page }) => {
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
  // Every syllabus goes to the server's reader once, even a text file.
  expect(routes.filter((r) => r !== "notes" && r !== "events")).toEqual(["syllabus-upload", "import-extract"]);
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

for (const [name, choose] of [["PDF", pdfFile("syllabus.pdf", SYLLABUS.split("\n"))], ["photo", photoFile("syllabus.png")]] as const) {
  test(`a ${name} goes to the reader once, and an item with no posted date is flagged`, async ({ page }) => {
    await signUpWithCourse(page);
    const routes = apiRoutes(page);
    await openUpload(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Choose upload file").setInputFiles(choose);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(dialog.getByLabel("Event title")).toHaveCount(2);
    await expect(dialog.getByLabel("Event title").first()).toHaveValue("Reading response 1");
    await expect(dialog.getByText("Some details need your attention.", { exact: false })).toBeVisible();
    expect(routes.filter((r) => r !== "notes" && r !== "events")).toEqual(["syllabus-upload", "import-extract"]);
  });
}

test("when the reader can't read a file, the reason is shown and the student's own events can still be saved", async ({ page }) => {
  await signUpWithCourse(page);
  await openUpload(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Choose upload file").setInputFiles(file("limit.txt", SYLLABUS));
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "That file needs another try" })).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveText("You can read 10 syllabi automatically each day. Try again tomorrow.");
  await expect(dialog.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Choose a different file" })).toBeVisible();
  await dialog.getByRole("button", { name: "Add events by hand" }).click();
  const added = dialog.getByRole("group", { name: "Added by you" });
  await added.getByLabel("Event title").fill("Midterm exam");
  await added.getByLabel("Type").selectOption("exam");
  await added.getByLabel("Due date").fill("2026-10-14");
  await dialog.getByRole("button", { name: "Add to schedule" }).click();
  await expect(dialog.getByRole("heading", { name: "A little more organized." })).toBeVisible();
  await expect(dialog.getByText("Added 1 event to CSE 442.")).toBeVisible();
});

test("while a syllabus is read, the screen says it can take a while", async ({ page }) => {
  await signUpWithCourse(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/index.php?route=import-extract", async (route) => {
    await held;
    await route.fallback();
  });
  await openUpload(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Choose upload file").setInputFiles(file("cse442-syllabus.txt", SYLLABUS));
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByText("Reading your syllabus carefully. This can take a minute or two.")).toBeVisible();
  release();
  await expect(dialog.getByRole("button", { name: "Add to schedule" })).toBeVisible();
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
