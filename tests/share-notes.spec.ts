import type { Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";

// Card 157: the "Share notes with friends" window on the course page. The account fixture stands in
// for the card 153 friend routes and the card 156 sharing routes.
const password = "Sample river password 42!";
const OWNER = "notely-deck-owner-442@example.edu";
const FRIEND = "notely-deck-friend-442@example.edu";
const OTHER = "notely-deck-other-442@example.edu";

// Calls the (mocked) API from the page, like the browser console steps on the cards.
function call(page: Page, route: string, body?: object) {
  return page.evaluate(async ([route, body]) => {
    const response = await fetch(`/api/index.php?route=${route}`, body ? {
      method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": "fixture-csrf" }, body: JSON.stringify(body),
    } : {});
    return response.json();
  }, [route, body] as const);
}
async function signUpOwner(page: Page) {
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByLabel("Your name").fill("Deck Owner");
  await page.getByLabel("Email address").fill(OWNER);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Add a course" }).click();
  await page.getByLabel("Course code").fill("CSE 442");
  await page.getByLabel("Term").fill("Fall 2026");
  await page.getByLabel("Course name").fill("Software Engineering");
  await page.getByRole("button", { name: "Add course" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "I’ll do this later" }).click();
  await page.getByRole("button", { name: "Let’s begin" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
}
// Deck Friend and Deck Other accept Deck Owner's requests unless `friends` is false.
async function setUp(page: Page, friends = true) {
  await page.goto("/");
  // Both friends finish setup, so signing in later opens their notes.
  await call(page, "register", { name: "Deck Friend", email: FRIEND, password });
  await call(page, "onboarding", {});
  await call(page, "register", { name: "Deck Other", email: OTHER, password });
  await call(page, "onboarding", {});
  await call(page, "logout", {});
  await page.reload();
  await signUpOwner(page);
  if (!friends) return;
  for (const email of [FRIEND, OTHER]) await call(page, "friend-request", { email });
  for (const email of [FRIEND, OTHER]) {
    await call(page, "login", { email, password });
    const { incoming } = await call(page, "friends");
    await call(page, "friend-respond", { id: incoming[0].id, accept: true });
  }
  await call(page, "login", { email: OWNER, password });
}
// The course page; the left menu's link is in the page on phones too, just hidden.
async function openCourse(page: Page) {
  const href = await page.locator('a[href^="/courses/"]').first().getAttribute("href");
  await page.goto(href!);
  await expect(page.getByRole("heading", { name: "Software Engineering", level: 1 })).toBeVisible();
  return href!.split("/").pop()!;
}
async function openWindow(page: Page) {
  await page.getByRole("button", { name: "Share notes with friends" }).click();
  const dialog = page.getByRole("dialog", { name: "Share your CSE 442 notes" });
  await expect(dialog).toBeVisible();
  // Phones show windows as sheets that slide up; wait until it has stopped moving.
  await dialog.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  return dialog;
}
const status = (page: Page) => page.getByRole("status").filter({ hasText: /^(Shared with|Not shared)/ });

test("share course notes with one friend", async ({ page }, testInfo) => {
  await setUp(page);
  const courseId = await openCourse(page);
  await expect(status(page)).toHaveText("Not shared with any friends.");
  const dialog = await openWindow(page);
  const friend = dialog.getByRole("checkbox", { name: /Deck Friend/ });
  const other = dialog.getByRole("checkbox", { name: /Deck Other/ });
  await expect(friend).not.toBeChecked();
  await expect(other).not.toBeChecked();
  await expect(dialog.getByText(FRIEND)).toBeVisible();
  await expect(dialog.getByText(OTHER)).toBeVisible();
  if (testInfo.project.name === "mobile") {
    for (const control of [dialog.locator("label").filter({ hasText: "Deck Friend" }), dialog.getByRole("button", { name: "Save" }),
      dialog.getByRole("button", { name: "Cancel" })]) {
      expect((await control.boundingBox())!.height, "44px tap target").toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }

  await friend.check();
  const sent = page.waitForRequest((r) => r.url().includes("route=course-notes-share&") || r.url().endsWith("route=course-notes-share"));
  await dialog.getByRole("button", { name: "Save" }).click();
  const { friends } = await call(page, "friends");
  const friendId = friends.find((f: { email: string }) => f.email === FRIEND).userId;
  expect((await sent).postDataJSON()).toEqual({ courseId, courseCode: "CSE 442", friendIds: [friendId] });
  await expect(dialog).toHaveCount(0);
  await expect(status(page)).toHaveText("Shared with Deck Friend");

  // Kept on the server: a reload and the window both show it.
  await page.reload();
  await expect(status(page)).toHaveText("Shared with Deck Friend");
  const again = await openWindow(page);
  await expect(again.getByRole("checkbox", { name: /Deck Friend/ })).toBeChecked();
  await expect(again.getByRole("checkbox", { name: /Deck Other/ })).not.toBeChecked();
});

test("unshare course notes", async ({ page }) => {
  await setUp(page);
  await openCourse(page);
  let dialog = await openWindow(page);
  await dialog.getByRole("checkbox", { name: /Deck Friend/ }).check();
  await dialog.getByRole("checkbox", { name: /Deck Other/ }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(status(page)).toHaveText("Shared with Deck Friend and Deck Other");

  dialog = await openWindow(page);
  await dialog.getByRole("checkbox", { name: /Deck Friend/ }).uncheck();
  await dialog.getByRole("checkbox", { name: /Deck Other/ }).uncheck();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(status(page)).toHaveText("Not shared with any friends.");
  await page.reload();
  await expect(status(page)).toHaveText("Not shared with any friends.");
});

test("no friends yet", async ({ page }) => {
  await setUp(page, false);
  await openCourse(page);
  const dialog = await openWindow(page);
  await expect(dialog.getByText("Add friends first to share your notes.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save" })).toHaveCount(0);
  await dialog.getByRole("link", { name: "Go to Friends" }).click();
  await expect(page).toHaveURL(/\/friends$/);
  await expect(page.getByRole("heading", { name: "Friends", level: 1 })).toBeVisible();
});

test("share notes error is shown in the window", async ({ page }) => {
  await setUp(page);
  await openCourse(page);
  await page.route("**/api/index.php?route=course-notes-share", (route) =>
    route.fulfill({ status: 422, json: { error: "You can share notes only with friends." } }));
  const dialog = await openWindow(page);
  await dialog.getByRole("checkbox", { name: /Deck Friend/ }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("You can share notes only with friends.");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled();
  // The page behind an open window is hidden from the label lookup, so close it first.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(status(page)).toHaveText("Not shared with any friends.");
});
