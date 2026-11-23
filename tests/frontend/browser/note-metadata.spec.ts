import type { Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";
import { register, createCourse } from "./support/task35";
import { openNew } from "./support/shell";

async function startUpload(page: Page) {
  await register(page);
  const courseId = await createCourse(page);
  await openNew(page, "Upload document");
  return courseId;
}

async function saveAndOpen(page: Page, title: string) {
  await page.getByRole("button", { name: "Save to my notes" }).click();
  await page.getByRole("button", { name: "All done" }).click();
  await page.goto("/notes");
  await page.getByLabel("Search notes").fill(title);
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByLabel("Note title")).toHaveValue(title);
}

async function openDetails(page: Page) {
  const details = page.getByRole("button", { name: "Details", exact: true });
  if (await details.getAttribute("aria-expanded") !== "true") await details.click();
  await expect(details).toHaveAttribute("aria-expanded", "true");
}

test("uploaded note displays extracted course and lecture date after reload on desktop and mobile", async ({ page }, testInfo) => {
  const courseId = await startUpload(page);
  await page.getByLabel("Choose upload file").setInputFiles("tests/frontend/browser/fixtures/cse442-lecture.txt");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Course", exact: true })).toHaveValue(courseId);
  await expect(page.getByLabel("Lecture date", { exact: true })).toHaveValue("2026-09-14");
  await saveAndOpen(page, "cse442-lecture");
  await page.reload();
  await expect(page.getByLabel("Note body")).toHaveText(/Sprint planning/);
  await expect(page.getByLabel("Note body")).toContainText("Assignment due: September 21, 2026");
  const editorUrl = page.url();
  for (const [width, height] of [[320, 640], [375, 812], [768, 900], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.goto(editorUrl);
    expect(await page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]);
    await openDetails(page);
    const course = page.getByRole("combobox", { name: "Course", exact: true });
    const date = page.getByLabel("Lecture date", { exact: true });
    await expect(course).toHaveValue(courseId);
    await expect(course.locator("option:checked")).toHaveText("CSE 442");
    await expect(date).toHaveValue("2026-09-14");
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    for (const field of [course, date]) {
      await field.scrollIntoViewIfNeeded();
      await expect(field).toBeVisible();
      await expect(field).toBeEnabled();
      await field.focus();
      await expect(field).toBeFocused();
      await expect(field).toBeInViewport({ ratio: 1 });
      const overflow = await field.evaluate(el => {
        const box = el.getBoundingClientRect();
        return Math.max(-box.left, box.right - document.documentElement.clientWidth, el.scrollWidth - el.clientWidth);
      });
      expect(overflow).toBeLessThanOrEqual(1);
    }
    if (width === 375 || width === 1440) {
      await page.screenshot({ path: testInfo.outputPath(`note-${width}.png`), fullPage: true });
    }
  }
  await page.goto(`/courses/${courseId}?lecture=2026-09-14`);
  await expect(page.getByRole("heading", { name: "cse442-lecture", exact: true })).toBeVisible();
});

test("missing metadata stays undetected through review, save and reload", async ({ page }) => {
  const courseId = await startUpload(page);
  await page.getByLabel("Choose upload file").setInputFiles({
    name: "Unidentified.txt", mimeType: "text/plain", buffer: Buffer.from("A few ideas about studying."),
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Course", exact: true })).toHaveValue("");
  await expect(page.getByLabel("Lecture date", { exact: true })).toHaveValue("");
  await expect(page.getByText("Some details need your attention. Check the course and dates below.")).toBeVisible();
  await expect(page.locator("#import-date-missing")).toHaveText("Not detected");
  await saveAndOpen(page, "Unidentified");
  await page.reload();
  await openDetails(page);
  await expect(page.getByLabel("Note body")).toContainText("A few ideas about studying.");
  await expect(page.getByRole("combobox", { name: "Course", exact: true }).locator("option:checked")).toHaveText("Not detected");
  await expect(page.getByLabel("Lecture date", { exact: true })).toHaveValue("");
  await expect(page.locator("#note-date-missing")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // A course-only note must also have a readable undated folder.
  const saved = page.waitForResponse(r => new URL(r.url()).searchParams.get("route") === "note-save");
  await page.getByRole("combobox", { name: "Course", exact: true }).selectOption(courseId);
  expect(await (await saved).json()).toMatchObject({ note: { courseId, lectureDate: "" } });
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toHaveText("All changes saved");
  await page.goto(`/courses/${courseId}`);
  await expect(page.getByRole("heading", { name: "Lecture date: Not detected" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Unidentified/ })).toBeVisible();
});
