import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";

const phone = { width: 390, height: 664 };
const brandName = { name: "Notely", exact: true };
const greeting = /^Good (morning|afternoon|evening), Header\.$/;
const account = (page: Page) => page.getByRole("button", { name: "Header Tester", exact: true });

async function register(page: Page) {
  await page.goto("/");
  const create = page.getByRole("button", { name: "Create account", exact: true });
  await create.click();
  const password = randomUUID() + "Qa!";
  await page.getByLabel("Your name").fill("Header Tester");
  await page.getByLabel("Email address").fill(`header-${randomUUID()}@example.edu`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await create.click();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: greeting })).toBeVisible();
  await expect(account(page)).toBeVisible();
}

async function openNotes(page: Page) {
  await page.getByRole("navigation").getByRole("link", { name: "Notes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your notes", exact: true })).toBeVisible();
}

async function expectToday(page: Page) {
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: greeting })).toBeVisible();
}

async function checkLayout(page: Page, size: typeof phone, controls: Locator[]) {
  const viewport = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(viewport).toEqual({ ...size, overflow: 0 });
  const boxes = [];
  for (const control of controls) {
    await expect(control).toBeVisible();
    const b = (await control.boundingBox())!;
    const label = control.toString();
    expect(b.width, label).toBeGreaterThan(0);
    expect(b.height, label).toBeGreaterThan(0);
    expect(b.x, label).toBeGreaterThanOrEqual(0);
    expect(b.y, label).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, label).toBeLessThanOrEqual(size.width);
    expect(b.y + b.height, label).toBeLessThanOrEqual(size.height);
    for (const previous of boxes) {
      const a = previous.box;
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `${previous.label} overlaps ${label}`).toBe(false);
    }
    boxes.push({ box: b, label });
  }
}

test("165-1 mobile header brand returns from Notes to Today", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Phone-only check");
  await page.setViewportSize(phone);
  await register(page);
  const header = page.getByRole("banner");
  const brand = header.getByRole("link", brandName);
  for (let visit = 0; visit < 2; visit++) {
    await openNotes(page);
    await expect(header).toBeVisible();
    await expect(page.getByRole("link", brandName)).toHaveCount(1);
    await expect(brand).toHaveText("Notely");
    await expect(brand.locator("svg")).toBeVisible();
    await expect(brand).toHaveAttribute("href", "/");
    await checkLayout(page, phone, [brand]);
    await brand.click();
    await expectToday(page);
  }
});

test("165-2 desktop sidebar has one brand linking to Today", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop-only check");
  const size = { width: 1440, height: 900 };
  await page.setViewportSize(size);
  await register(page);
  await openNotes(page);
  const sidebar = page.getByRole("complementary");
  const brand = sidebar.getByRole("link", brandName);
  await expect(sidebar).toBeVisible();
  await expect(page.getByRole("link", brandName)).toHaveCount(1);
  await expect(page.locator("header").getByRole("link", brandName)).toBeHidden();
  await checkLayout(page, size, [brand, sidebar.getByRole("button", { name: "New", exact: true }), account(page)]);
  await brand.click();
  await expectToday(page);
});

test("165-3 narrow phone header and navigation fit and support the keyboard", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Phone-only check");
  const small = { width: 320, height: 640 };
  await page.setViewportSize(small);
  await register(page);
  for (const size of [small, phone]) {
    await test.step(`${size.width} CSS px`, async () => {
      await page.setViewportSize(size);
      await openNotes(page);
      const brand = page.getByRole("banner").getByRole("link", brandName);
      const nav = page.getByRole("navigation", { name: "Mobile navigation" });
      const more = nav.getByRole("button", { name: "More" });
      const create = page.getByRole("button", { name: "New", exact: true });
      const links = [];
      for (const [name, href] of [["Today", "/"], ["Schedule", "/schedule"], ["Notes", "/notes"], ["Courses", "/courses"]]) {
        const link = nav.getByRole("link", { name, exact: true });
        await expect(link).toHaveAttribute("href", href);
        links.push(link);
      }
      await checkLayout(page, size, [brand, account(page), create, ...links, more]);
      await brand.focus();
      await page.keyboard.press("Tab");
      await expect(account(page)).toBeFocused();
      await expect(account(page)).toHaveCSS("outline-style", "solid");
      await page.keyboard.press("Enter");
      const menu = page.getByRole("menu");
      const item = (name: string) => menu.getByRole("menuitem", { name, exact: true });
      await checkLayout(page, size, [item("Settings"), item("Log out")]);
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(account(page)).toBeFocused();
      await create.press("Enter");
      await expect(item("Note")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await more.press("Enter");
      await checkLayout(page, size, [item("Assignments"), item("Friends")]);
      await expect(item("Assignments")).toHaveAttribute("href", "/assignments");
      await expect(item("Friends")).toHaveAttribute("href", "/friends");
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await brand.press("Enter");
      await expectToday(page);
    });
  }
});
