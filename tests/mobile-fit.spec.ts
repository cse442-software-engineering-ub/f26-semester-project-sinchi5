// Card 164: on phones every field uses 16px text, so iPhone Safari doesn't zoom in when one is
// tapped (it zooms on anything smaller), and the note's Course / Lecture date / Category boxes stay
// inside the screen. Desktop sizes don't change.
import { test, expect } from "./support/account-fixture";
import type { Page } from "@playwright/test";

const NOTE = "Agile development & the Scrum framework";

// Visible text fields whose text is under 16px, as "label: size".
function smallFields(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll("input, select, textarea")]
    .filter((field) => {
      const type = field.getAttribute("type");
      const box = field.getBoundingClientRect();
      return !["checkbox", "radio", "file", "color", "range", "hidden"].includes(type ?? "") &&
        box.width > 0 && box.height > 0 && getComputedStyle(field).visibility !== "hidden";
    })
    .filter((field) => parseFloat(getComputedStyle(field).fontSize) < 16)
    .map((field) => {
      const name = field.getAttribute("aria-label") ||
        (field as HTMLInputElement).labels?.[0]?.firstChild?.textContent?.trim() ||
        field.getAttribute("placeholder") || field.tagName;
      return `${name}: ${getComputedStyle(field).fontSize}`;
    }));
}
async function lookAround(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
}
async function openNote(page: Page) {
  await page.goto("/notes");
  await page.getByText(NOTE).first().click();
  await expect(page.getByLabel("Lecture date", { exact: true })).toBeVisible();
}
// Right edge of the input or drop-down inside each metadata label.
function metadataBoxes(page: Page) {
  return page.evaluate(() => ["Course", "Lecture date", "Category"].map((name) => {
    const label = [...document.querySelectorAll("label")].find((l) => l.firstChild?.textContent?.trim() === name);
    const box = label!.querySelector("input, select")!.getBoundingClientRect();
    return { name, left: box.left, right: box.right, top: box.top, size: getComputedStyle(label!.querySelector("input, select")!).fontSize };
  }));
}

test("fields are at least 16px on a phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Phone-only check");
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(page.getByLabel("Your name")).toBeVisible();
  expect(await smallFields(page), "Create your workspace").toEqual([]);

  await page.goto("/");
  await page.getByRole("button", { name: "I already have an account" }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
  expect(await smallFields(page), "sign-in").toEqual([]);

  await lookAround(page);
  await page.getByRole("button", { name: "Add course", exact: true }).first().click();
  const addCourse = page.getByRole("dialog", { name: "Add a course" });
  await expect(addCourse).toBeVisible();
  expect(await smallFields(page), "Add a course").toEqual([]);
  expect(await addCourse.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth), "Add a course fits").toBe(true);
  await page.keyboard.press("Escape");

  await page.goto("/notes");
  await expect(page.getByLabel("Search notes")).toBeVisible();
  expect(await smallFields(page), "Notes list").toEqual([]);

  await page.getByRole("button", { name: "Create Note" }).first().click();
  await expect(page.getByRole("dialog").getByLabel("Note title")).toBeVisible();
  expect(await smallFields(page), "Create Note").toEqual([]);
  await page.keyboard.press("Escape");

  await openNote(page);
  expect(await smallFields(page), "note editor").toEqual([]);

  await page.goto("/schedule");
  await page.getByRole("button", { name: "Add event" }).click();
  await expect(page.getByRole("dialog").getByLabel("Title")).toBeVisible();
  expect(await smallFields(page), "Add event").toEqual([]);
  await page.keyboard.press("Escape");

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  expect(await smallFields(page), "Settings").toEqual([]);
});

test("note fields stay on screen on a phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Phone-only check");
  await lookAround(page);
  await openNote(page);
  for (const size of [{ width: 390, height: 664 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(size);
    for (const box of await metadataBoxes(page)) {
      expect(box.left, `${box.name} at ${size.width}px`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${box.name} at ${size.width}px`).toBeLessThanOrEqual(size.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(size.width);
  }
});

test("desktop fields unchanged", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Desktop-only check");
  await page.setViewportSize({ width: 1440, height: 900 });
  await lookAround(page);
  await openNote(page);
  const [course, date, category] = await metadataBoxes(page);
  for (const box of [course, date, category]) expect(box.size, box.name).toBe("11.68px");
  // Two columns: Course and Lecture date side by side, Category below Course.
  expect(date.top).toBe(course.top);
  expect(date.left).toBeGreaterThan(course.right);
  expect(category.top).toBeGreaterThan(course.top);
  expect(category.left).toBe(course.left);
});
