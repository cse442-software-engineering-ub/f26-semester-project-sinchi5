import { test, expect } from "./support/account-fixture";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const password = "Sample meadow password 42!";
const photo = (extension = "png") => ({ name: `photo.${extension}`, mimeType: extension === "jpg" ? "image/jpeg" : `image/${extension}`,
  buffer: readFileSync(new URL(`../backend/tests/data/photo-64.${extension}`, import.meta.url)) });
const summary = (page: Page) => page.getByRole("group", { name: "Account summary" });
async function uploadPhoto(page: Page, extension = "png") {
  const sent = page.waitForRequest(request => request.method() === "POST" && new URL(request.url()).searchParams.get("route") === "profile-photo");
  await page.getByLabel("Profile photo", { exact: true }).setInputFiles(photo(extension));
  const request = await sent;
  await expect(page.getByRole("status")).toHaveText("Photo updated.");
  await expect(summary(page).locator("img")).toHaveJSProperty("naturalWidth", 64);
  return request;
}
async function register(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByLabel("Your name").fill("Jamie");
  await page.getByLabel("Email address").fill("jamie@example.edu");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const code = await page.getByLabel("Recovery code", { exact: true }).textContent();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "I’ll do this later" }).click();
  await page.getByRole("button", { name: "Let’s begin" }).click();
  await expect(page.getByRole("heading", { name: /Good .*Jamie/ })).toBeVisible();
  return code!;
}
test("navigation logout returns to sign in and blocks notes after Back or direct navigation", async ({ page }) => {
  await register(page);
  await page.goto("/notes");
  await expect(page.getByRole("heading", { name: "Your notes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log out", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/welcome\?mode=signin$/);
  await expect(page.getByRole("heading", { name: "Good to see you again." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log out", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Notes", exact: true })).toHaveCount(0);

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Your notes" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Notes", exact: true })).toHaveCount(0);
  await page.goto("/notes");
  await expect(page).toHaveURL(/\/welcome\?mode=signin$/);
  await expect(page.getByRole("heading", { name: "Good to see you again." })).toBeVisible();
});
test("account changes, invalid current password, recovery rotation and deletion", async ({ page }) => {
  const code = await register(page);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toContain(password); expect(stored).not.toContain(code); expect(stored).not.toContain('"user":');
  await page.goto("/settings");
  await page.getByRole("button", { name: "Edit account", exact: true }).click();
  await page.getByLabel("Your name").fill("Jamie Lee");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Account details saved.");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await page.getByLabel("Current password").fill("wrong password");
  await page.getByLabel("New password", { exact: true }).fill("Changed meadow password 43!");
  await page.getByLabel("Confirm new password").fill("Changed meadow password 43!");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Your current password is incorrect.");
  await page.getByLabel("Current password").fill(password);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Password changed");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Good to see you again." })).toBeVisible();
  await page.getByRole("button", { name: "Forgot your password?" }).click();
  await page.getByLabel("Email address").fill("jamie@example.edu");
  await page.getByLabel("Recovery code", { exact: true }).fill("invalid-code");
  await page.getByLabel("New password", { exact: true }).fill("Recovered meadow password 44!");
  await page.getByLabel("Confirm password", { exact: true }).fill("Recovered meadow password 44!");
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByText(/Recovery codes have 32 characters/)).toBeVisible();
  await expect(page.getByLabel("Recovery code", { exact: true })).toBeFocused();
  await page.getByLabel("Recovery code", { exact: true }).fill("0000-0000-0000-0000-0000-0000-0000-0000");
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Email or recovery code is incorrect.");
  await page.getByLabel("Recovery code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByLabel("Recovery code", { exact: true })).not.toHaveText(code);
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Password reset");
  await page.getByLabel("Password", { exact: true }).fill("Recovered meadow password 44!");
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await page.getByLabel("Current password").fill("Recovered meadow password 44!");
  await page.getByLabel("I understand that deletion is permanent").check();
  await page.getByRole("button", { name: "Permanently delete account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Good to see you again." })).toBeVisible();
});
test("account forms fit narrow screens, report mismatches, and recovery code remains visible until saved", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByLabel("Your name").fill("Jamie");
  await page.getByLabel("Email address").fill("jamie@example.edu");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill("different password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Passwords do not match.");
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});
test("replacement recovery code cannot be dismissed before acknowledgement", async ({ page }) => {
  await register(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Replace recovery code", exact: true }).click();
  await page.getByLabel("Current password").fill(password);
  await page.getByRole("button", { name: "Generate replacement code", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Your new recovery code" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeDisabled();
  await dialog.getByLabel("I saved my recovery code").check();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog).not.toBeVisible();
});
test("signup explains emoji, hidden characters, and unsupported password characters before sending", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", r => { if (r.method() === "POST") requests.push(r.url()); });
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  const name = page.getByLabel("Your name");
  await name.fill("Jamie 😀");
  await name.blur();
  await expect(page.getByText("Your name can’t include emoji. Use letters only.")).toBeVisible();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await name.fill("Jamie@home");
  await expect(page.getByText('Your name can’t include "@".', { exact: false })).toBeVisible();
  await name.fill("Zoë O'Brien");
  await expect(name).not.toHaveAttribute("aria-invalid", "true");
  const email = page.getByLabel("Email address");
  await email.fill("zoë@example.edu");
  await email.blur();
  await expect(page.getByText('Email addresses can’t include "ë".', { exact: false })).toBeVisible();
  await email.fill("zoe@example.edu");
  const passwordInput = page.getByLabel("Password", { exact: true });
  await passwordInput.fill("correct horse 😀");
  await expect(page.getByText("Passwords can’t include emoji.", { exact: false })).toBeVisible();
  await passwordInput.fill("pässwort sicher");
  await expect(page.getByText("Passwords can’t include accented letters", { exact: false })).toBeVisible();
  await expect(page.getByText("ä", { exact: false })).toHaveCount(0);
  await passwordInput.fill("short");
  await page.getByLabel("Confirm password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("Use at least 8 characters for your password. It currently has 5.")).toBeVisible();
  await expect(passwordInput).toBeFocused();
  expect(requests.filter(url => url.includes("route=register"))).toEqual([]);
  await passwordInput.fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByLabel("Recovery code", { exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("change photo uploads image bytes and refreshes the Account Summary", async ({ page }) => {
  await register(page);
  await page.goto("/settings");
  await expect(summary(page).getByText("J", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change photo", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove photo", exact: true })).toHaveCount(0);
  for (const extension of ["png", "jpg", "webp"]) {
    const image = summary(page).locator("img");
    const previous = await image.count() ? await image.getAttribute("src") : null;
    const request = await uploadPhoto(page, extension);
    expect(new URL(request.url()).pathname).toBe("/api/index.php");
    expect(request.postDataJSON()).toEqual({ content: photo(extension).buffer.toString("base64") });
    expect(request.headers()["x-csrf-token"]).toBe("fixture-csrf");
    await expect(summary(page).locator("img")).not.toHaveAttribute("src", previous || "");
    await expect(summary(page).getByText("J", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove photo", exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(summary(page).locator("img")).toHaveJSProperty("naturalWidth", 64);
  await expect(summary(page).getByText("Jamie", { exact: true })).toBeVisible();
});

test("photo checks reject unsupported, disguised, and oversized files before requests", async ({ page }) => {
  await register(page);
  await page.goto("/settings");
  await uploadPhoto(page);
  const original = await summary(page).locator("img").getAttribute("src");
  const uploads: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).searchParams.get("route") === "profile-photo") uploads.push(request.url());
  });
  const oversized = Buffer.alloc(2 * 1024 * 1024 + 1);
  photo().buffer.copy(oversized);
  for (const [file, message] of [
    [{ name: "photo.txt", mimeType: "text/plain", buffer: Buffer.from("plain text") }, "Choose a PNG, JPEG, or WebP image."],
    [{ name: "disguised.png", mimeType: "image/png", buffer: Buffer.from("not an image") }, "Choose a PNG, JPEG, or WebP image."],
    [{ name: "large.png", mimeType: "image/png", buffer: oversized }, "Profile pictures can be at most 2 MB."],
  ] as const) {
    await page.getByLabel("Profile photo", { exact: true }).setInputFiles(file);
    await expect(page.getByRole("alert")).toHaveText(message);
    await expect(page.getByRole("button", { name: "Change photo", exact: true })).toBeEnabled();
    await expect(summary(page).locator("img")).toHaveAttribute("src", original!);
    await expect(summary(page).locator("img")).toHaveJSProperty("naturalWidth", 64);
  }
  expect(uploads).toEqual([]);
});

test("remove photo restores the initial and keeps account details", async ({ page }) => {
  await register(page);
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Remove photo", exact: true })).toHaveCount(0);
  await uploadPhoto(page);
  const sent = page.waitForRequest(request => request.method() === "POST" && new URL(request.url()).searchParams.get("route") === "profile-photo-remove");
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  expect((await sent).headers()["x-csrf-token"]).toBe("fixture-csrf");
  await expect(page.getByRole("status")).toHaveText("Photo removed.");
  await expect(summary(page).getByText("J", { exact: true })).toBeVisible();
  await expect(summary(page).locator("img")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove photo", exact: true })).toHaveCount(0);
  await expect(summary(page).getByText("Jamie", { exact: true })).toBeVisible();
  await expect(summary(page).getByText("jamie@example.edu", { exact: true })).toBeVisible();
});

test("photo keyboard picker cancellation and mobile targets", async ({ page }) => {
  await register(page);
  await page.goto("/settings");
  const change = page.getByRole("button", { name: "Change photo", exact: true });
  await expect(change).toBeVisible();
  await expect(page.getByLabel("Profile photo", { exact: true })).toHaveAttribute("accept", ".png,.jpg,.jpeg,.webp");
  for (let tabs = 0; tabs < 40 && !(await change.evaluate(element => element === document.activeElement)); tabs++) {
    await page.keyboard.press("Tab");
  }
  await expect(change).toBeFocused();
  const choosing = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  const chooser = await choosing;
  // An empty native selection models closing the picker without choosing a file.
  await chooser.setFiles([]);
  await expect(summary(page).getByText("J", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
  expect((await change.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await uploadPhoto(page);
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Photo removed.");
  await page.screenshot({ path: "test-results/account-photo-mobile.png" });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("photo failures preserve the image and allow retries without duplicate submissions", async ({ page }) => {
  await register(page);
  await page.goto("/settings");
  await uploadPhoto(page);
  const original = await summary(page).locator("img").getAttribute("src");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let attempts = 0;
  await page.route(url => url.searchParams.get("route") === "profile-photo", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    attempts++;
    await held;
    await route.fulfill({ status: 422, json: { error: "This image could not be read. Try another file." } });
  });
  await page.getByLabel("Profile photo", { exact: true }).setInputFiles(photo());
  await expect(page.getByRole("status")).toHaveText("Uploading photo…");
  await expect(page.getByRole("button", { name: "Change photo", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Remove photo", exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toHaveText("This image could not be read. Try another file.");
  expect(attempts).toBe(1);
  await expect(summary(page).locator("img")).toHaveAttribute("src", original!);
  await page.unrouteAll({ behavior: "wait" });
  await uploadPhoto(page); // The same file can be selected again.
  await page.route(url => url.searchParams.get("route") === "profile-photo-remove", route =>
    route.fulfill({ status: 503, json: { error: "Please try removing your photo again." } }));
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Please try removing your photo again.");
  await expect(summary(page).locator("img")).toHaveJSProperty("naturalWidth", 64);
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Photo removed.");
});

test("photo load failure falls back to initials and demo controls stay hidden", async ({ page }) => {
  await register(page);
  await page.goto("/settings");
  await uploadPhoto(page);
  await page.route(url => url.searchParams.get("route") === "profile-photo", route =>
    route.request().method() === "GET" ? route.fulfill({ status: 404, json: { error: "No profile photo yet." } }) : route.fallback());
  await page.reload();
  await expect(summary(page).getByText("J", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove photo", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await page.goto("/settings");
  await expect(page.getByText("You’re exploring a sample workspace.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change photo", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove photo", exact: true })).toHaveCount(0);
});
