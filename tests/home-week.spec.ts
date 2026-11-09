import type { Page } from "@playwright/test";
import type { CourseEvent } from "../src/domain";
import { test, expect } from "./support/account-fixture";
import { signUpWithCourse } from "./support/syllabus";

// Task #136 only. Combine with #135's independent suite after it merges into dev.
test.describe("Task #136", () => {
  test.use({ timezoneId: "America/New_York", locale: "en-GB" });

  const comingUpCard = (page: Page) => page.getByRole("region", { name: "Coming up", exact: true });
  const futureEvent = (
    id: string,
    title: string,
    date: string,
    kind: CourseEvent["kind"],
    courseId = "",
    time = "",
  ): CourseEvent => ({
    id, title, date, kind, courseId, time,
    location: "", description: "", source: "imported",
  });

  const comingUpEvents = (courseId: string) => [
    futureEvent("exam-3", "Exam 3", "2026-12-15", "exam", courseId),
    futureEvent("project", "Final project", "2026-11-15", "deadline", courseId),
    futureEvent("homework", "Homework 7", "2026-11-07", "assignment", courseId),
    futureEvent("exam-2", "Exam 2", "2026-11-25", "exam", courseId),
    futureEvent("midterm", "Midterm exam", "2026-11-05", "exam", courseId, "14:00"),
    futureEvent("exam-0", "Exam 0", "2026-10-29", "exam", courseId),
  ];

  async function seedComingUp(page: Page, makeEvents: (courseId: string) => CourseEvent[]) {
    // Fixed local noon on October 26; the November dates cross the DST transition.
    await page.clock.setFixedTime(new Date("2026-10-26T16:00:00Z"));
    await signUpWithCourse(page, "notely-coming-up-136@example.edu");
    const courseId = await page.evaluate(() => {
      const workspace = JSON.parse(localStorage.getItem("notely-workspace-v1-42")!);
      return workspace.courses.find((course: { code: string }) => course.code === "CSE 442").id as string;
    });
    let events = makeEvents(courseId);
    // Keep account-fixture's auth/onboarding; only supply this test's server events.
    await page.route("**/api/index.php?route=events*", (route) => route.fulfill({ json: { events } }));
    await page.reload();
    await expect(comingUpCard(page)).toBeVisible();
    return async (next: CourseEvent[]) => {
      events = next;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    };
  }

  test.beforeEach(async ({ page }, testInfo) => {
    await page.setViewportSize(testInfo.project.name === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 });
  });

  test("Coming up replaces the heads-up panel", async ({ page }) => {
    await seedComingUp(page, comingUpEvents);
    await expect(page.getByRole("heading", { name: "A little heads-up", exact: true })).toHaveCount(0);
    const aside = page.getByRole("complementary").filter({ has: comingUpCard(page) });
    await expect(aside.locator(":scope > section").nth(1)).toHaveAttribute("aria-labelledby", "coming-up-heading");
    await expect(aside.getByRole("heading", { name: "On the horizon", exact: true })).toBeVisible();
    await aside.getByRole("link", { name: "Open schedule", exact: true }).click();
    await expect(page).toHaveURL(/\/schedule$/);
    await expect(page.getByRole("heading", { name: "Your schedule", exact: true })).toBeVisible();
  });

  test("Coming up empty", async ({ page }) => {
    await seedComingUp(page, () => []);
    await expect(comingUpCard(page).getByRole("heading", { name: "Coming up", exact: true })).toBeVisible();
    await expect(comingUpCard(page).getByText("No exams or projects coming up.", { exact: true })).toBeVisible();
    await expect(comingUpCard(page).getByRole("button")).toHaveCount(0);
  });

  test("Coming up lists the next three exams and projects", async ({ page }) => {
    await seedComingUp(page, comingUpEvents);
    const rows = comingUpCard(page).getByRole("button");
    await expect(rows).toHaveCount(3);
    await expect(rows.locator("strong")).toHaveText(["Midterm exam", "Final project", "Exam 2"]);
    await expect(rows.locator("small")).toHaveText(["CSE 442", "CSE 442", "CSE 442"]);
    await expect(rows.locator("time")).toHaveText(["Thu, Nov 5", "Sun, Nov 15", "Wed, Nov 25"]);
    await expect(rows.locator("em")).toHaveText(["in 10 days", "in 20 days", "in 30 days"]);
    for (const title of ["Exam 3", "Homework 7", "Exam 0"]) {
      await expect(comingUpCard(page).getByRole("button", { name: new RegExp(title) })).toHaveCount(0);
    }
    for (const row of await rows.all()) {
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("coming-up-list.png"), fullPage: true });
  });

  test("Coming up opens event details", async ({ page }) => {
    await seedComingUp(page, comingUpEvents);
    const row = comingUpCard(page).getByRole("button", { name: /Midterm exam/ });
    await row.click();
    const dialog = page.getByRole("dialog", { name: "Event details", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("Midterm exam");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(comingUpCard(page)).toBeVisible();
    await expect(row).toBeFocused();
    await row.press("Enter");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(row).toBeFocused();
    await row.press("Space");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("Midterm exam");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  for (const width of [1440, 390]) {
    test(`Coming up wraps a 160-character unbroken title at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      const title = "A".repeat(160);
      await seedComingUp(page, () => [futureEvent("long-exam", title, "2026-11-05", "exam")]);
      const panel = comingUpCard(page);
      const row = panel.getByRole("button", { name: new RegExp(title) });
      await expect(row).toBeVisible();
      const panelBounds = (await panel.boundingBox())!;
      const titleBounds = (await row.locator("strong").boundingBox())!;
      expect(titleBounds.x).toBeGreaterThanOrEqual(panelBounds.x);
      expect(titleBounds.x + titleBounds.width).toBeLessThanOrEqual(panelBounds.x + panelBounds.width);
      expect(await row.locator("strong").evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length;
      })).toBeGreaterThan(1);
      expect(await panel.evaluate((element) => element.scrollWidth === element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)).toBe(true);
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: test.info().outputPath(`coming-up-long-${width}.png`), fullPage: true });
      await row.click();
      await expect(page.getByRole("dialog", { name: "Event details", exact: true }).getByLabel("Title", { exact: true })).toHaveValue(title);
    });
  }

  test("Coming up refreshes and falls back to Personal for missing courses", async ({ page }) => {
    const refresh = await seedComingUp(page, () => [
      futureEvent("personal", "Personal exam", "2026-11-02", "exam"),
      futureEvent("orphan", "Independent project", "2026-11-03", "deadline", "missing-course"),
    ]);
    const rows = comingUpCard(page).getByRole("button");
    await expect(rows.locator("small")).toHaveText(["Personal", "Personal"]);
    await expect(rows.locator("em")).toHaveText(["in 7 days", "in 8 days"]);
    await refresh([]);
    await expect(comingUpCard(page).getByText("No exams or projects coming up.", { exact: true })).toBeVisible();
    await expect(rows).toHaveCount(0);
  });
});
