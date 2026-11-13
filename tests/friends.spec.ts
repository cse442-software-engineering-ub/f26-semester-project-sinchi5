import type { Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";

// Card 154: the Friends page. The account fixture stands in for the card 153 PHP routes,
// so requests sent by one student show up for another within a test.
const password = "Sample river password 42!";
const ANA = "notely-friends-a-442@example.edu";
const BEA = "notely-friends-b-442@example.edu";
const CAL = "notely-friends-c-442@example.edu";

async function signUp(page: Page, name: string, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "I’ll do this later" }).click();
  await page.getByRole("button", { name: "Let’s begin" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
}
async function logOut(page: Page) {
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("button", { name: /^(Log In|I already have an account)$/ })).toBeVisible();
}
async function logIn(page: Page, email: string) {
  const choose = page.getByRole("button", { name: "I already have an account" });
  if (await choose.isVisible()) await choose.click();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your notes", exact: true })).toBeVisible();
}
// The left menu on a computer, the bottom menu on a phone.
function menu(page: Page) {
  return page.getByRole("navigation", { name: /^(Main|Mobile) navigation$/ }).filter({ visible: true });
}
async function openFriends(page: Page) {
  await menu(page).getByRole("link", { name: "Friends", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Friends", exact: true, level: 1 })).toBeVisible();
}
async function sendRequest(page: Page, email: string) {
  await page.getByLabel("Classmate's email").fill(email);
  await page.getByRole("button", { name: "Send request", exact: true }).click();
}
const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const empty = "No friends yet. Add a classmate by email.";

test("Friends page opens from the menu after Notes and starts empty", async ({ page }) => {
  await signUp(page, "Friend Ana", ANA);
  const labels = await menu(page).getByRole("link").allInnerTexts();
  const notes = labels.findIndex((label) => /^Notes/.test(label.trim()));
  expect(labels[notes + 1].trim()).toBe("Friends");
  await openFriends(page);
  await expect(page).toHaveURL(/\/friends$/);
  await expect(page.getByText(empty)).toBeVisible();
});

test("send request shows it under Sent requests as Pending", async ({ page }) => {
  await signUp(page, "Friend Bea", BEA);
  await logOut(page);
  await signUp(page, "Friend Ana", ANA);
  await openFriends(page);
  const request = page.waitForRequest((r) => r.url().includes("route=friend-request"));
  await sendRequest(page, BEA);
  expect((await request).postDataJSON()).toEqual({ email: BEA });
  await expect(page.getByRole("status")).toHaveText("Request sent.");
  await expect(page.getByLabel("Classmate's email")).toHaveValue("");
  const sent = section(page, "Sent requests").getByRole("listitem");
  await expect(sent).toHaveCount(1);
  await expect(sent).toContainText("Friend Bea");
  await expect(sent).toContainText("Pending");
  await expect(page.getByText(empty)).toBeVisible();
});

test("request errors from the server show under the field", async ({ page }) => {
  await signUp(page, "Friend Ana", ANA);
  await openFriends(page);
  const errors = [
    [404, "No registered account was found for this email."],
    [422, "You can’t add yourself as a friend."],
    [409, "You’re already friends with this person."],
  ] as const;
  for (const [status, error] of errors) {
    await page.route("**/api/index.php?route=friend-request", (route) => route.fulfill({ status, json: { error } }));
    await sendRequest(page, BEA);
    const field = page.getByLabel("Classmate's email");
    await expect(page.locator("#friend-email-error")).toHaveText(error);
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveValue(BEA);
    await expect(page.getByText("Request sent.")).toHaveCount(0);
    await page.unroute("**/api/index.php?route=friend-request");
  }
  // A malformed address gets the same message as sign-up (story #152, Test 3 step 4).
  await sendRequest(page, "not an email");
  await expect(page.locator("#friend-email-error")).toHaveText("Email addresses can’t contain spaces.");
});

test("answer requests: Accept moves them to Your friends, Decline removes them", async ({ page }) => {
  await signUp(page, "Friend Bea", BEA);
  await logOut(page);
  await signUp(page, "Friend Ana", ANA);
  await openFriends(page);
  await sendRequest(page, BEA);
  await expect(page.getByText("Request sent.")).toBeVisible();
  await logOut(page);
  await signUp(page, "Friend Cal", CAL);
  await openFriends(page);
  await sendRequest(page, BEA);
  await expect(page.getByText("Request sent.")).toBeVisible();
  await logOut(page);
  await logIn(page, BEA);
  await openFriends(page);
  const incoming = section(page, "Requests for you");
  await expect(incoming.getByRole("listitem")).toHaveCount(2);
  await incoming.getByRole("button", { name: "Accept Friend Ana" }).click();
  await expect(section(page, "Your friends").getByRole("listitem")).toContainText("Friend Ana");
  await incoming.getByRole("button", { name: "Decline Friend Cal" }).click();
  await expect(section(page, "Requests for you")).toHaveCount(0);
  await expect(section(page, "Your friends").getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText("Friend Cal")).toHaveCount(0);
});

test("remove friend asks first; Cancel keeps them and Remove friend removes them", async ({ page }) => {
  await signUp(page, "Friend Bea", BEA);
  await logOut(page);
  await signUp(page, "Friend Ana", ANA);
  await openFriends(page);
  await sendRequest(page, BEA);
  await expect(page.getByText("Request sent.")).toBeVisible();
  await logOut(page);
  await logIn(page, BEA);
  await openFriends(page);
  await page.getByRole("button", { name: "Accept Friend Ana" }).click();
  await logOut(page);
  await logIn(page, ANA);
  await openFriends(page);
  const friends = section(page, "Your friends");
  await expect(friends.getByRole("listitem")).toContainText("Friend Bea");
  const dialog = page.getByRole("dialog", { name: "Remove Friend Bea from your friends?" });
  await friends.getByRole("button", { name: "Remove Friend Bea" }).click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(friends.getByRole("listitem")).toContainText("Friend Bea");
  await friends.getByRole("button", { name: "Remove Friend Bea" }).click();
  await dialog.getByRole("button", { name: "Remove friend", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(empty)).toBeVisible();
});

test("signed out visitors to /friends see the sign-in screen", async ({ page }) => {
  await page.goto("/friends");
  await expect(page.getByRole("heading", { name: /^(Welcome to your space\.|Good to see you again\.)$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Friends", exact: true })).toHaveCount(0);
});

test("fits a phone: bottom menu, 44 px buttons, and a 100-character name wraps", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Phone-only check");
  const long = "Bea" + "x".repeat(97);
  await signUp(page, long, BEA);
  // The Today page lets a name this long cover the bottom menu on a phone (outside this card), so leave it first.
  await page.goto("/friends");
  await logOut(page);
  await signUp(page, "Friend Ana", ANA);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Friends" })).toBeVisible();
  await openFriends(page);
  await sendRequest(page, BEA);
  await expect(section(page, "Sent requests")).toContainText(long);
  for (const button of await page.getByRole("main").getByRole("button").all()) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
