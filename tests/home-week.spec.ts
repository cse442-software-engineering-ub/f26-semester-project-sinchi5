import type { Page } from "@playwright/test";
import type { CourseEvent } from "../src/domain";
import { test, expect } from "./support/account-fixture";
import { signUpWithCourse } from "./support/syllabus";

// Local noon stays on the same calendar date in both configured browser projects.
const TODAY = "2026-10-26";
const card = (page: Page) => page.getByRole("region", { name: "Your week at a glance", exact: true });
const event = (id: string, title: string, date: string, time: string, kind: CourseEvent["kind"], courseId = ""): CourseEvent => ({
  id, title, date, time, kind, courseId, location: "", description: "", source: "imported",
});

async function seed(page: Page, makeEvents: (courseId: string) => CourseEvent[]) {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  await signUpWithCourse(page);
  const courseId = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem("notely-workspace-v1-42")!);
    return workspace.courses.find((course: { code: string }) => course.code === "CSE 442").id as string;
  });
  let events = makeEvents(courseId);
  // Extend the account fixture's mocked events endpoint without changing shared fixtures.
  await page.route("**/api/index.php?route=events*", (route) => route.fulfill({ json: { events } }));
  await page.reload();
  await expect(card(page)).toBeVisible();
  return async (next: CourseEvent[]) => {
    events = next;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  };
}

const weekEvents = (courseId: string) => [
  event("meeting", "Team meeting", "2026-11-01", "", "other"),
  event("homework", "Homework 5", "2026-10-27", "23:59", "assignment", courseId),
  event("quiz", "Quiz 3", TODAY, "09:00", "quiz", courseId),
];

test("the week card replaces the hero", async ({ page }) => {
  await seed(page, weekEvents);
  await expect(page.getByText(/Big ideas start\s+with a little note\./)).toHaveCount(0);
  // The former hero is the first section immediately following the greeting.
  await expect(page.getByRole("main").locator(":scope > section").first()).toHaveAttribute("aria-labelledby", "week-heading");
  const headsUp = page.locator("section").filter({ has: page.getByRole("heading", { name: "A little heads-up", exact: true }) });
  await expect(headsUp).toBeVisible();
  await expect(headsUp.getByRole("button")).toHaveCount(3);
  await expect(headsUp.getByRole("button").first()).toContainText("Quiz 3");
  await expect(page.getByRole("heading", { name: "Coming up", exact: true })).toHaveCount(0);
  await card(page).getByRole("link", { name: "See the whole semester" }).click();
  await expect(page).toHaveURL(/\/assignments$/);
  await expect(page.getByRole("heading", { name: "Assignments", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Homework 5/ })).toBeVisible();
});

test("empty week", async ({ page }) => {
  await seed(page, () => [
    event("past", "Past due", "2026-10-25", "", "assignment"),
    event("outside", "Next week", "2026-11-02", "", "exam"),
    event("class", "Lecture", TODAY, "10:00", "lecture"),
  ]);
  await expect(card(page).getByText("Nothing due this week.", { exact: true })).toBeVisible();
  await expect(card(page).getByText("Enjoy the breathing room.", { exact: true })).toBeVisible();
  await expect(card(page).getByRole("button")).toHaveCount(0);
  await expect(card(page).getByRole("region")).toHaveCount(0);
});

test("groups this week's items by day", async ({ page }) => {
  await seed(page, weekEvents);
  await expect(card(page).getByText("3 things due this week", { exact: true })).toBeVisible();
  await expect(card(page).getByRole("heading", { level: 3 })).toHaveText(["Today", "Tomorrow", "Sunday, November 1"]);
  await expect(card(page).getByRole("button")).toHaveText([
    "9:00 AMQuiz 3CSE 442 · quiz",
    "11:59 PMHomework 5CSE 442 · assignment",
    "All dayTeam meetingPersonal · other",
  ]);
  for (const row of await card(page).getByRole("button").all()) {
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)).toBe(true);
});

test("groups this week's items by day with one event", async ({ page }) => {
  await seed(page, (courseId) => [weekEvents(courseId)[1]]);
  await expect(card(page).getByText("1 thing due this week", { exact: true })).toBeVisible();
  await expect(card(page).getByRole("button")).toHaveCount(1);
});

test("groups this week's items by day includes every event and refreshes", async ({ page }) => {
  const refresh = await seed(page, (courseId) => [
    ...weekEvents(courseId),
    event("noon", "Lunch", TODAY, "12:00", "other", "missing-course"),
    event("midnight", "Midnight task", TODAY, "00:00", "deadline"),
  ]);
  await expect(card(page).getByText("5 things due this week", { exact: true })).toBeVisible();
  await expect(card(page).getByRole("button")).toHaveText([
    "12:00 AMMidnight taskPersonal · deadline",
    "9:00 AMQuiz 3CSE 442 · quiz",
    "12:00 PMLunchPersonal · other",
    "11:59 PMHomework 5CSE 442 · assignment",
    "All dayTeam meetingPersonal · other",
  ]);
  await refresh([]);
  await expect(card(page).getByText("Nothing due this week.", { exact: true })).toBeVisible();
  await expect(card(page).getByRole("button")).toHaveCount(0);
});

test("opens event details", async ({ page }) => {
  await seed(page, weekEvents);
  const row = card(page).getByRole("button", { name: /Homework 5/ });
  await row.click();
  const dialog = page.getByRole("dialog", { name: "Event details", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("Homework 5");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card(page)).toBeVisible();
  await expect(row).toBeFocused();
  await row.press("Enter");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeFocused();
});

for (const width of [1440, 390]) {
  test(`long titles stay inside the card at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    const title = "Prepare the team project presentation and review the course requirements. ".repeat(3).slice(0, 160);
    await seed(page, () => [event("long", title, TODAY, "09:00", "assignment")]);
    const row = card(page).getByRole("button", { name: new RegExp(title) });
    await expect(row).toBeVisible();
    const bounds = await card(page).boundingBox();
    const textBounds = await row.locator("strong").boundingBox();
    expect(textBounds!.x).toBeGreaterThanOrEqual(bounds!.x);
    expect(textBounds!.x + textBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    expect(await row.locator("strong").evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    })).toBeGreaterThan(1);
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`home-week-${width}.png`), fullPage: true });
  });
}
