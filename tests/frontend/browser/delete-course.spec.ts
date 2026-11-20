import type { Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";

const target = { id: "qa-delete-452", code: "QA 452", name: "Delete Course Test" };
const keep = { id: "qa-keep-453", code: "QA 453", name: "Keep Course Test" };
const schedule = "/schedule?date=2026-11-20";
const password = "Sample river password 42!";
const dialog = (page: Page) => page.getByRole("dialog", { name: "Delete course?" });
const trigger = (page: Page) => page.getByRole("button", { name: "Delete course", exact: true });

async function api(page: Page, route: string, body?: object) {
  return page.evaluate(async ([route, body]) => {
    const response = await fetch(`/api/index.php?route=${route}`, body && {
      method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": "fixture-csrf" }, body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Fixture ${route} returned ${response.status}`);
    return response.json();
  }, [route, body] as const);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await api(page, "register", { name: "Course Owner", email: "owner@example.edu", password });
  await api(page, "onboarding", {});
  for (const course of [target, keep]) {
    await api(page, "course-save", { ...course, term: "Fall 2026", color: "#869D7A" });
    await api(page, "event-save", { courseId: course.id, title: course.code + " Study Group", kind: "other", date: "2026-11-20", time: "12:30" });
  }
  await api(page, "note-create", { courseId: target.id, title: "QA 452 Lecture Notes", body: "Keep this lecture text." });
  await page.goto("/courses");
  await page.locator("main").getByRole("link", { name: /QA 452/ }).click();
});

test("cancel restores focus and keeps the course and event", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", r => { if (r.url().includes("route=course-delete")) requests.push(r.url()); });
  await trigger(page).click();
  const modal = dialog(page);
  await expect(modal).toHaveAccessibleDescription("Delete QA 452? Its events will be deleted, but its notes will be kept.");
  await expect(modal.getByRole("button", { name: "Delete course" })).toBeInViewport();
  const bounds = await modal.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await modal.getByRole("button", { name: "Cancel" }).click();
  await expect(modal).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
  await expect(page.getByRole("link", { name: /QA 452 Study Group/ })).toBeVisible();
  expect(requests).toEqual([]);
});

test("confirmation sends one selected ID and another signed-in window sees the removal", async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto(schedule);
  await expect(other.getByText("QA 452 Study Group", { exact: true }).first()).toBeVisible();
  const requests: object[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/*?route=course-delete", async route => {
    requests.push(route.request().postDataJSON());
    await pending;
    await route.fallback();
  });
  await trigger(page).click();
  const confirm = dialog(page).getByRole("button", { name: "Delete course" });
  await confirm.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(confirm).toBeDisabled();
  await expect(dialog(page).getByRole("button", { name: "Cancel" })).toBeDisabled();
  release();
  await expect(page).toHaveURL(/\/courses$/);
  await page.reload();
  await expect(page.locator("main").getByRole("link", { name: /QA 453/ })).toBeVisible();
  await expect(page.locator("main").getByRole("link", { name: /QA 452/ })).toHaveCount(0);
  await other.reload();
  await expect(other.getByText("QA 453 Study Group", { exact: true }).first()).toBeVisible();
  await expect(other.getByText("QA 452 Study Group", { exact: true })).toHaveCount(0);
  await other.goto("/courses");
  await expect(other.locator("main").getByRole("link", { name: /QA 453/ })).toBeVisible();
  await expect(other.locator("main").getByRole("link", { name: /QA 452/ })).toHaveCount(0);
  await page.goto("/notes");
  await expect(page.getByRole("heading", { name: "QA 452 Lecture Notes" })).toBeVisible();
  expect((await api(page, "notes")).notes).toEqual([expect.objectContaining({ courseId: "", body: "Keep this lecture text." })]);
  expect(requests).toEqual([{ id: target.id }]);
});

for (const status of [503, 404]) {
  test(`HTTP ${status} while the course still exists permits retry`, async ({ page }) => {
    await page.route("**/*?route=course-delete", route => route.fulfill({ status, json: { error: "Try again later." } }), { times: 1 });
    await trigger(page).click();
    const confirm = dialog(page).getByRole("button", { name: "Delete course" });
    await confirm.click();
    await expect(dialog(page).getByRole("alert")).toContainText("Try again later.");
    await expect(page).toHaveURL(new RegExp(target.id + "$"));
    expect((await api(page, "courses")).courses).toHaveLength(2);
    await confirm.click();
    await expect(page).toHaveURL(/\/courses$/);
  });
}

test("a maximum-length course code wraps without hiding the dialog controls", async ({ page }) => {
  const code = "A".repeat(64);
  await api(page, "course-save", { ...target, code, term: "Fall 2026", color: "#869D7A" });
  await page.reload();
  await trigger(page).click();
  const modal = dialog(page);
  await expect(modal).toHaveAccessibleDescription(`Delete ${code}? Its events will be deleted, but its notes will be kept.`);
  expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await expect(modal.getByRole("button", { name: "Cancel" })).toBeInViewport();
  await expect(modal.getByRole("button", { name: "Delete course" })).toBeInViewport();
});

test("a course removed in another window reconciles a stale confirmation", async ({ page, context }) => {
  await trigger(page).click();
  const other = await context.newPage();
  await other.goto("/courses");
  await api(other, "course-delete", { id: target.id });
  await dialog(page).getByRole("button", { name: "Delete course" }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.locator("main").getByRole("link", { name: /QA 453/ })).toBeVisible();
});

test("a shared course with edit permission has no owner delete control", async ({ page }) => {
  const email = "classmate@example.edu";
  await api(page, "register", { name: "Classmate", email, password });
  await api(page, "onboarding", {});
  await api(page, "login", { email: "owner@example.edu", password });
  await api(page, "schedule-share", { courseId: target.id, email, permission: "edit" });
  await api(page, "login", { email, password });
  const requests: string[] = [];
  page.on("request", r => { if (r.url().includes("route=course-delete")) requests.push(r.url()); });
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "Shared by Course Owner" })).toBeVisible();
  await expect(trigger(page)).toHaveCount(0);
  expect(requests).toEqual([]);
});
