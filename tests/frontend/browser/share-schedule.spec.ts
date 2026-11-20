import type { Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";

// Card 144: the "Share this schedule" window on the course page, and a shared course in the classmate's
// schedule, view only. The account fixture stands in for the card 143 routes, following the PHP rules.
const password = "Sample river password 42!";
const OWNER = "notely-sharesched-owner-442@example.edu";
const CLASSMATE = "notely-sharesched-classmate-442@example.edu";

// Calls the (mocked) API from the page, like the browser console steps on the cards.
function call(page: Page, route: string, body?: object) {
  return page.evaluate(async ([route, body]) => {
    const response = await fetch(`/api/index.php?route=${route}`, body ? {
      method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": "fixture-csrf" }, body: JSON.stringify(body),
    } : {});
    return response.json();
  }, [route, body] as const);
}
function tomorrow() {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Schedule Classmate and Schedule Owner both finish setup; Schedule Owner has CSE 442 with a Study session
// tomorrow at 7:00 PM, is signed in, and is on that course's page.
async function setUp(page: Page, { share = false } = {}) {
  await page.goto("/");
  await call(page, "register", { name: "Schedule Classmate", email: CLASSMATE, password });
  await call(page, "onboarding", {});
  await call(page, "register", { name: "Schedule Owner", email: OWNER, password });
  await call(page, "onboarding", {});
  const { course } = await call(page, "course-save", { code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" });
  await call(page, "event-save", { courseId: course.id, title: "Study session", kind: "other", date: tomorrow(), time: "19:00", location: "", description: "Bring the lab handout" });
  if (share) await call(page, "schedule-share", { courseId: course.id, email: CLASSMATE });
  await page.goto(`/courses/${course.id}`);
  await expect(page.getByRole("link", { name: "All course notes" })).toBeVisible();
  return course.id as string;
}
async function signInAs(page: Page, email: string) {
  await call(page, "login", { email, password });
}
const shareWindow = (page: Page) => page.getByRole("dialog", { name: "Share this schedule" });
async function openShareWindow(page: Page) {
  await page.getByRole("button", { name: "Share schedule" }).click();
  await expect(shareWindow(page)).toBeVisible();
}
async function shareWith(page: Page, email: string) {
  await shareWindow(page).getByLabel("Classmate's email").fill(email);
  await shareWindow(page).getByRole("button", { name: "Share", exact: true }).click();
}

test("Card 144: owner shares a schedule with a classmate by email", async ({ page }) => {
  const courseId = await setUp(page);
  await openShareWindow(page);
  await expect(shareWindow(page).getByText("Not shared with anyone yet.")).toBeVisible();
  const request = page.waitForRequest((r) => r.url().includes("route=schedule-share") && r.method() === "POST");
  await shareWith(page, CLASSMATE);
  expect((await request).postDataJSON()).toEqual({ courseId, email: CLASSMATE, permission: "view" });
  const row = shareWindow(page).getByRole("listitem").filter({ hasText: "Schedule Classmate" });
  await expect(row).toContainText("Can view");
  await expect(shareWindow(page).getByLabel("Classmate's email")).toHaveValue("");
  await expect(shareWindow(page).getByText("Not shared with anyone yet.")).toHaveCount(0);
  // The list comes from the server when the window opens again.
  await shareWindow(page).getByRole("button", { name: "Close" }).click();
  await openShareWindow(page);
  await expect(shareWindow(page).getByRole("listitem").filter({ hasText: "Schedule Classmate" })).toContainText("Can view");
});

test("Card 144: share errors are shown under the email field", async ({ page }) => {
  await setUp(page, { share: true });
  await openShareWindow(page);
  await expect(shareWindow(page).getByRole("listitem")).toHaveCount(1);
  const email = shareWindow(page).getByLabel("Classmate's email");
  for (const [value, message] of [
    ["nobody-here-442@example.edu", "No registered account was found for this email."],
    [OWNER, "You can’t share a schedule with yourself."],
    [CLASSMATE, "This schedule is already shared with that person."],
    ["name@school", "Enter a complete email address, like name@university.edu."],
  ]) {
    await shareWith(page, value);
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAccessibleDescription(message);
    await expect(shareWindow(page).getByText(message)).toBeVisible();
    // The typed address stays so it can be fixed.
    await expect(email).toHaveValue(value);
  }
  await expect(shareWindow(page).getByRole("listitem").filter({ hasText: "Schedule Classmate" })).toHaveCount(1);
  // Typing again clears the message.
  await email.fill("x");
  await expect(email).toHaveAttribute("aria-invalid", "false");
});

test("Card 144: classmate sees shared events read-only", async ({ page, isMobile }) => {
  const courseId = await setUp(page, { share: true });
  await signInAs(page, CLASSMATE);
  await page.goto("/courses");
  const card = page.getByRole("main").getByRole("link", { name: /CSE 442/ });
  await expect(card).toContainText("Shared by Schedule Owner");
  if (!isMobile) {
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: /CSE 442/ }))
      .toContainText("Shared by Schedule Owner");
  }
  // The course page shows whose it is and none of the owner's controls.
  await card.click();
  await expect(page.getByText("Shared by Schedule Owner. You can view its schedule.")).toBeVisible();
  for (const name of ["Share schedule", "Upload syllabus", "Share notes with friends"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: /Study session/ })).toBeVisible();

  await page.goto(`/schedule?date=${tomorrow()}`);
  const row = page.getByRole("button", { name: /Study session/ }).filter({ hasText: "Shared by Schedule Owner" });
  await expect(row).toContainText("7:00 PM");
  await row.click();
  const details = page.getByRole("dialog", { name: "Event details" });
  await expect(details).toHaveAccessibleDescription("Shared by Schedule Owner. You can view this event.");
  await expect(details).toContainText("Bring the lab handout");
  await expect(details.getByRole("textbox")).toHaveCount(0);
  await expect(details.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  await expect(details.getByRole("button", { name: "Delete event" })).toHaveCount(0);
  await details.getByRole("button", { name: "Close" }).click();
  await expect(details).toBeHidden();

  // A shared course isn't a choice for the classmate's own events.
  await page.getByRole("button", { name: "Add event" }).click();
  const add = page.getByRole("dialog", { name: "Make room for what’s next" });
  await expect(add.getByLabel("Course").locator("option")).toHaveText(["Personal"]);
  await add.getByRole("button", { name: "Close" }).click();
  // The server refuses it too, and the course page can't be shared by the classmate.
  expect(await call(page, "event-save", { courseId, title: "Mine now", kind: "other", date: tomorrow(), time: "" }))
    .toEqual({ error: "You do not have permission to edit this schedule." });
});

test("Card 144: stop sharing removes the classmate", async ({ page }) => {
  await setUp(page, { share: true });
  await openShareWindow(page);
  const request = page.waitForRequest((r) => r.url().includes("route=schedule-unshare"));
  await shareWindow(page).getByRole("button", { name: "Stop sharing with Schedule Classmate" }).click();
  expect((await request).postDataJSON()).toMatchObject({ userId: expect.any(String) });
  await expect(shareWindow(page).getByText("Not shared with anyone yet.")).toBeVisible();
  await shareWindow(page).getByRole("button", { name: "Close" }).click();
  await signInAs(page, CLASSMATE);
  await page.goto("/courses");
  await expect(page.getByRole("heading", { name: "No courses yet" })).toBeVisible();
  await page.goto(`/schedule?date=${tomorrow()}`);
  await expect(page.getByText("A little breathing room")).toBeVisible();
});

test("Card 144: the share window fits and stays usable on a phone", async ({ page }) => {
  await setUp(page, { share: true });
  await openShareWindow(page);
  const dialog = shareWindow(page);
  for (const control of [dialog.getByLabel("Classmate's email"), dialog.getByRole("button", { name: "Share", exact: true }),
    dialog.getByRole("button", { name: "Close" }), dialog.getByRole("button", { name: /Stop sharing/ })]) {
    await expect(control).toBeInViewport();
  }
  for (const button of [dialog.getByRole("button", { name: "Share", exact: true }), dialog.getByRole("button", { name: /Stop sharing/ })]) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


test("Card 147: share with edit access and downgrade to view", async ({ page }) => {
  const courseId = await setUp(page);
  await openShareWindow(page);
  await expect(shareWindow(page).getByLabel("Permission", { exact: true })).toHaveValue("view");
  await shareWindow(page).getByLabel("Permission", { exact: true }).selectOption("edit");
  const sent = page.waitForRequest(r => r.url().includes("route=schedule-share") && r.method() === "POST");
  await shareWith(page, CLASSMATE);
  expect((await sent).postDataJSON()).toEqual({ courseId, email: CLASSMATE, permission: "edit" });
  const permission = shareWindow(page).getByLabel("Permission for Schedule Classmate");
  await expect(permission).toHaveValue("edit");
  const changed = page.waitForRequest(r => r.url().includes("route=schedule-permission"));
  await permission.selectOption("view");
  expect((await changed).postDataJSON()).toMatchObject({ courseId, permission: "view" });
  await expect(permission).toHaveValue("view");
  await expect(permission).toBeEnabled();
  await shareWindow(page).getByRole("button", { name: "Close" }).click();
  await openShareWindow(page);
  await expect(shareWindow(page).getByLabel("Permission for Schedule Classmate")).toHaveValue("view");
});

test("Card 147: editor adds and edits events, owner sees added by, downgrade blocks editing", async ({ page }) => {
  const courseId = await setUp(page);
  const { share } = await call(page, "schedule-share", { courseId, email: CLASSMATE, permission: "edit" });
  await signInAs(page, CLASSMATE);
  await page.goto('/schedule?date=' + tomorrow());
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox", { name: "Course", exact: true }).locator("option")).toHaveText(["Personal", "CSE 442 (Schedule Owner)"]);
  await dialog.getByLabel("Title", { exact: true }).fill("Group meeting");
  await dialog.getByRole("combobox", { name: "Course", exact: true }).selectOption(courseId);
  await dialog.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /Group meeting/ }).click();
  dialog = page.getByRole("dialog", { name: "Event details" });
  await expect(dialog.getByRole("button", { name: "Delete event", exact: true })).toHaveCount(0);
  await dialog.getByLabel("Title", { exact: true }).fill("Group meeting (room 101)");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog).toBeHidden();
  await signInAs(page, OWNER);
  await page.goto('/schedule?date=' + tomorrow());
  await expect(page.getByRole("button", { name: /Group meeting \(room 101\)/ })).toContainText("Added by Schedule Classmate");
  await call(page, "schedule-permission", { courseId, userId: share.userId, permission: "view" });
  await signInAs(page, CLASSMATE);
  await page.goto('/schedule?date=' + tomorrow());
  await page.getByRole("button", { name: /Group meeting \(room 101\)/ }).click();
  dialog = page.getByRole("dialog", { name: "Event details" });
  await expect(dialog).toHaveAccessibleDescription("Shared by Schedule Owner. You can view this event.");
  await expect(dialog.getByRole("button", { name: "Save changes" })).toHaveCount(0);
});
