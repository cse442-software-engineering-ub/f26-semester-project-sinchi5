// Card 165: phones hide the left menu, so the top bar shows "Notely" (linking to Today) instead.
// Desktop keeps the name once, in the left menu.
import { test, expect } from "./support/account-fixture";
import type { Locator, Page } from "@playwright/test";

const GREETING = /Good (morning|afternoon|evening)/;

async function lookAround(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await expect(page.getByRole("heading", { name: GREETING })).toBeVisible();
}
const box = async (locator: Locator) => (await locator.boundingBox())!;
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("mobile header shows Notely", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Phone-only check");
  await lookAround(page);
  const header = page.locator("header");
  const brand = header.getByRole("link", { name: "Notely", exact: true });
  await expect(brand).toBeVisible();
  await expect(brand).toHaveAttribute("href", "/");
  // The name replaces the "My Workspace / Today" path, which only fit as "My …".
  await expect(header.getByText("My Workspace")).toBeHidden();

  await page.goto("/notes");
  await expect(page.getByRole("heading", { name: "Your notes" })).toBeVisible();
  await brand.click();
  await expect(page.getByRole("heading", { name: GREETING })).toBeVisible();

  // The smallest phones: the name, search, Create (+), and account buttons all fit without overlapping.
  for (const size of [{ width: 390, height: 664 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(size);
    const controls = [
      brand,
      header.getByRole("link", { name: "Search your space" }),
      header.getByRole("button", { name: "Create" }),
      header.getByRole("link", { name: "Your account" }),
    ];
    const boxes = [];
    for (const control of controls) {
      await expect(control).toBeVisible();
      const b = await box(control);
      expect(b.x, `left edge at ${size.width}px`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `right edge at ${size.width}px`).toBeLessThanOrEqual(size.width);
      boxes.push(b);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j]), `controls ${i} and ${j} at ${size.width}px`).toBe(false);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(size.width);
  }
});

test("desktop shows Notely once", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Desktop-only check");
  await page.setViewportSize({ width: 1440, height: 900 });
  await lookAround(page);
  const visibleNames = page.getByRole("link", { name: /^Notely/ }).filter({ visible: true });
  await expect(visibleNames).toHaveCount(1);
  await expect(page.locator("aside").getByRole("link", { name: /^Notely/ })).toBeVisible();
  await expect(page.locator("header").getByRole("link", { name: "Notely", exact: true })).toBeHidden();
  await expect(page.locator("header").getByText("My Workspace")).toBeVisible();
});
