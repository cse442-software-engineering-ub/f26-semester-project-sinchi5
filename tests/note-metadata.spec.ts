import { test, expect, type Page } from "@playwright/test";

async function startUpload(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: "Upload document", exact: true }).click();
}

async function saveAndOpen(page: Page, title: string) {
  await page.getByRole("button", { name: "Save to my notes" }).click();
  await page.getByRole("button", { name: "All done" }).click();
  await page.goto(`/notes?q=${encodeURIComponent(title)}`);
  await page.getByRole("heading", { name: title, exact: true }).click();
  await expect(page.getByLabel("Note title")).toHaveValue(title);
}

test("uploaded note displays extracted course and lecture date after reload on desktop and mobile", async ({ page }, testInfo) => {
  await startUpload(page);
  await page.getByLabel("Choose upload file").setInputFiles("tests/fixtures/cse442-lecture.txt");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Course", exact: true })).toHaveValue("cse442");
  await expect(page.getByLabel("Lecture date", { exact: true })).toHaveValue("2026-09-14");
  await saveAndOpen(page, "cse442-lecture");
  await page.reload();
  await expect(page.getByLabel("Note body")).toHaveValue(/Sprint planning/);
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const course = page.getByRole("combobox", { name: "Course", exact: true });
    const date = page.getByLabel("Lecture date", { exact: true });
    await expect(course.locator("option:checked")).toHaveText("CSE 442");
    await expect(date).toHaveValue("2026-09-14");
    await expect(course).toBeInViewport();
    await expect(date).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const field of [course, date]) {
      expect(await field.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    if (width === 375 || width === 1440) {
      await page.screenshot({ path: testInfo.outputPath(`note-${width}.png`), fullPage: true });
    }
  }
  await page.goto("/courses/cse442?lecture=2026-09-14");
  await expect(page.getByRole("heading", { name: "cse442-lecture", exact: true })).toBeVisible();
});

test("missing metadata stays undetected through review, save and reload", async ({ page }) => {
  await startUpload(page);
  await page.getByLabel("Choose upload file").setInputFiles({
    name: "Unidentified.txt", mimeType: "text/plain", buffer: Buffer.from("A few ideas about studying."),
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Course", exact: true })).toHaveValue("");
  await expect(page.getByLabel("Lecture date", { exact: true })).toHaveValue("");
  await expect(page.locator("#import-date-missing")).toHaveText("Not detected");
  await saveAndOpen(page, "Unidentified");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Course", exact: true }).locator("option:checked")).toHaveText("Not detected");
  await expect(page.getByLabel("Lecture date", { exact: true })).toHaveValue("");
  await expect(page.locator("#note-date-missing")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // A course-only note must also have a readable undated folder.
  await page.getByRole("combobox", { name: "Course", exact: true }).selectOption("cse442");
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  await page.goto("/courses/cse442");
  await expect(page.getByRole("heading", { name: "Lecture date: Not detected" })).toBeVisible();
});
