import { test, expect } from "./support/account-fixture";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";

const password = "Sample river password 42!";
const email = "notely-task162-442@example.edu";
const square = readFileSync(new URL("../backend/tests/data/photo-64.png", import.meta.url));
// Real RGB PNG generated with standard-library zlib; its non-square size exposes stretching.
const portrait = readFileSync(new URL("fixtures/profile-photo-64x128.png", import.meta.url));
const summary = (page: Page) => page.getByRole("group", { name: "Account summary" });
const accountLink = (page: Page) => page.getByRole("link", { name: "Your account", exact: true });
const avatars = (page: Page) => [
  page.locator('aside [class*="workspace"] > [class*="avatar"]'),
  accountLink(page).locator(":scope > span"),
  summary(page).locator(':scope > [class*="avatar"]'),
];
async function register(page: Page, name = "Picture Tester", address = email) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email address").fill(address);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "I’ll do this later" }).click();
  await page.getByRole("button", { name: "Let’s begin" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`Good .*${name.split(" ")[0]}`) })).toBeVisible();
  await accountLink(page).click();
  await expect(summary(page)).toBeVisible();
}
async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Good to see you again." })).toBeVisible();
}
async function signIn(page: Page, address = email) {
  await page.getByLabel("Email address").fill(address);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(accountLink(page)).toBeVisible();
  await accountLink(page).click();
  await expect(summary(page)).toBeVisible();
}
async function expectInitials(page: Page, letter = "P") {
  for (const avatar of avatars(page)) {
    await expect(avatar).toHaveCount(1);
    await expect(avatar).toHaveText(letter);
    await expect(avatar.locator("img")).toHaveCount(0);
  }
}
async function expectPhotos(page: Page, height = 64) {
  const sources: string[] = [];
  for (const [index, avatar] of avatars(page).entries()) {
    await expect(avatar).toHaveCount(1);
    await expect(avatar.locator("img")).toHaveJSProperty("naturalWidth", 64);
    await expect(avatar.locator("img")).toHaveJSProperty("naturalHeight", height);
    await expect(avatar.locator("img")).toHaveAttribute("alt", index === 1 ? "Your profile photo" : "");
    await expect(avatar).toHaveText("");
    sources.push((await avatar.locator("img").getAttribute("src"))!);
  }
  expect(new Set(sources).size).toBe(1);
  const url = new URL(sources[0], page.url());
  expect(url.origin).toBe(new URL(page.url()).origin);
  expect(url.searchParams.get("route")).toBe("profile-photo");
  expect([...url.searchParams.keys()].sort()).toEqual(["route", "v"]);
  return sources[0];
}
async function upload(page: Page, bytes = square) {
  const response = page.waitForResponse(response => response.request().method() === "POST"
    && new URL(response.url()).searchParams.get("route") === "profile-photo");
  await page.getByLabel("Profile photo", { exact: true }).setInputFiles({ name: "my-photo.png", mimeType: "image/png", buffer: bytes });
  const result = await response;
  expect(result.status()).toBe(200);
  expect((await result.json()).user.hasPhoto).toBe(true);
  await expect(page.getByRole("status")).toHaveText("Photo updated.");
}
async function remove(page: Page) {
  const response = page.waitForResponse(response => new URL(response.url()).searchParams.get("route") === "profile-photo-remove");
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  expect((await (await response).json()).user.hasPhoto).toBe(false);
  await expect(page.getByRole("status")).toHaveText("Photo removed.");
}

test("photo replaces the initial everywhere and persists across sign-in and account switches", async ({ page }) => {
  await register(page);
  await expectInitials(page);
  const footer = page.locator('aside [class*="sideFooter"]');
  await expect(footer).toHaveText("Picture Tester");
  await expect(footer.locator('img, [class*="avatar"]')).toHaveCount(0);
  await upload(page);
  const first = await expectPhotos(page);
  await upload(page, portrait);
  const replacement = await expectPhotos(page, 128);
  expect(replacement).not.toBe(first);
  // Unrelated rendering and navigation reuse the same revision instead of adding random URLs.
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expectPhotos(page, 128);
  await page.locator('a[href="/notes"]:visible').filter({ hasText: "Notes" }).click();
  await expect(page.getByRole("heading", { name: "Your notes" })).toBeVisible();
  await accountLink(page).click();
  expect(await expectPhotos(page, 128)).toBe(replacement);
  await signOut(page);
  await signIn(page);
  await expectPhotos(page, 128);
  await signOut(page);
  await page.goto("/");
  await register(page, "Other Student", "notely-task162-other@example.edu");
  await expectInitials(page, "O");
  await upload(page);
  const other = await expectPhotos(page);
  expect(other).not.toBe(replacement);
  await signOut(page);
  await signIn(page);
  await expectPhotos(page, 128);
});

test("falls back to the initial after removal or failed GET and recovers on a new photo", async ({ page }) => {
  await register(page);
  await expectInitials(page);
  await upload(page);
  await expectPhotos(page);
  await remove(page);
  await expectInitials(page);
  await upload(page);
  await expectPhotos(page);
  let brokenRequests = 0;
  const broken = (url: URL) => url.searchParams.get("route") === "profile-photo";
  await page.route(broken, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    brokenRequests++;
    await route.fulfill({ status: 404, json: { error: "No profile photo yet." } });
  });
  await page.reload();
  await expectInitials(page);
  expect(brokenRequests).toBeGreaterThan(0);
  const completedRequests = brokenRequests;
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expectInitials(page);
  expect(brokenRequests).toBe(completedRequests);
  await expect(page.getByRole("button", { name: "Remove photo", exact: true })).toBeEnabled();
  await page.unroute(broken);
  await upload(page, portrait);
  await expectPhotos(page, 128);
});

test("mobile avatars crop a portrait without stretching and keep account navigation accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page);
  await upload(page, portrait);
  await expectPhotos(page, 128);
  await page.reload();
  await expectPhotos(page, 128);
  const control = accountLink(page);
  const bounds = (await control.boundingBox())!;
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  for (const avatar of avatars(page).slice(1)) {
    const layout = await avatar.evaluate(element => {
      const img = element.querySelector("img")!;
      const box = element.getBoundingClientRect();
      const imageBox = img.getBoundingClientRect();
      return { width: box.width, height: box.height, imageWidth: imageBox.width, imageHeight: imageBox.height,
        radius: getComputedStyle(element).borderRadius, overflow: getComputedStyle(element).overflow,
        fit: getComputedStyle(img).objectFit };
    });
    expect(layout.width).toBe(layout.height);
    expect(layout.imageWidth).toBe(layout.width);
    expect(layout.imageHeight).toBe(layout.height);
    expect(layout.radius).toBe("50%");
    expect(layout.overflow).toBe("hidden");
    expect(layout.fit).toBe("cover");
  }
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: "test-results/profile-photo-mobile.png" });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
  await upload(page);
  await expectPhotos(page);
  await remove(page);
  await expectInitials(page);
  await page.goto("/notes");
  await control.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(summary(page)).toBeVisible();
});
