import type { Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";

// Card 120: signed-in accounts use the server-backed notes repository. The
// account fixture stands in for the PHP API, so state survives reloads and
// sign-ins within a test.
const password = "Sample river password 42!";

async function signUp(page: Page, name: string, email: string, course?: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (course) {
    await page.getByRole("button", { name: "Add a course" }).click();
    await page.getByLabel("Course code").fill(course);
    await page.getByLabel("Course name").fill("Software Engineering");
    await page.getByRole("button", { name: "Add course", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Skip for now" }).click();
  }
  await page.getByRole("button", { name: "I’ll do this later" }).click();
  await page.getByRole("button", { name: "Let’s begin" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
}

async function logOut(page: Page) {
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  // Logging out shows either the welcome choices or the sign-in form.
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

async function createNote(page: Page, title: string) {
  await page.goto("/notes");
  await page.getByRole("button", { name: "Create Note" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Note" });
  await dialog.getByLabel("Note title").fill(title);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(card(page, title)).toBeVisible();
}

async function confirmDelete(page: Page, trigger: string) {
  await page.getByRole("button", { name: trigger, exact: true }).click();
  await page.getByRole("dialog", { name: "Delete this note?" }).getByRole("button", { name: "Delete note", exact: true }).click();
}

const card = (page: Page, title: string) => page.getByRole("heading", { name: title, exact: true });
const courseId = (page: Page, code: string) => page.evaluate((code) => {
  for (const key of Object.keys(localStorage).filter((k) => k.startsWith("notely-workspace-v1-"))) {
    const course = JSON.parse(localStorage.getItem(key)!).courses.find((c: { code: string }) => c.code === code);
    if (course) return course.id as string;
  }
  throw new Error(`No course ${code}`);
}, code);

test("Test 1 - a note deleted from the notes page stays gone after reload and search", async ({ page }) => {
  await signUp(page, "Delete Note Tester", "notely-delete-list@example.edu");
  await createNote(page, "Keep this note");
  await createNote(page, "Remove from list");
  await confirmDelete(page, "Delete Remove from list");
  await expect(page.getByRole("status").filter({ hasText: "Note deleted." })).toBeVisible();
  await page.reload();
  await expect(card(page, "Keep this note")).toBeVisible();
  await expect(card(page, "Remove from list")).toHaveCount(0);
  await expect(page.getByText("1 notes in your space")).toBeVisible();
  await page.getByLabel("Search notes").fill("Remove");
  await expect(page.getByRole("heading", { name: "No notes found" })).toBeVisible();
});

test("Test 2 - a note deleted from the editor leaves every place notes appear", async ({ page }) => {
  await signUp(page, "Delete Note Tester", "notely-delete-editor@example.edu", "CSE 442");
  const course = await courseId(page, "CSE 442");
  await createNote(page, "Remove from editor");
  await card(page, "Remove from editor").click();
  await page.getByRole("combobox", { name: "Course", exact: true }).selectOption({ label: "CSE 442" });
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  const noteUrl = page.url();

  // A lecture today links its notes from the schedule.
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  const eventDialog = page.getByRole("dialog");
  await eventDialog.getByLabel("Title", { exact: true }).fill("Software engineering lecture");
  await eventDialog.getByRole("combobox", { name: "Course", exact: true }).selectOption({ label: "CSE 442" });
  await eventDialog.getByRole("combobox", { name: "Event type", exact: true }).selectOption("lecture");
  await eventDialog.getByRole("button", { name: "Create event" }).click();
  const openLectureNotes = async () => {
    await page.goto("/schedule");
    await page.getByRole("button", { name: /Software engineering lecture/ }).click();
    await page.getByRole("link", { name: "Open lecture notes" }).click();
    await expect(page).toHaveURL(new RegExp(`/courses/${course}\\?lecture=`));
  };
  await openLectureNotes();
  await expect(card(page, "Remove from editor")).toBeVisible();

  await page.goto(noteUrl);
  await confirmDelete(page, "Delete note");
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByRole("status").filter({ hasText: "Note deleted." })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(noteUrl);
  await expect(page.getByRole("heading", { name: "We couldn’t open that note" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to notes" })).toBeVisible();

  await page.goto("/notes");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your notes", exact: true })).toBeVisible();
  await expect(card(page, "Remove from editor")).toHaveCount(0);
  await page.goto(`/courses/${course}`);
  await expect(page.getByRole("heading", { name: "Software Engineering", level: 1 })).toBeVisible();
  await expect(card(page, "Remove from editor")).toHaveCount(0);
  await openLectureNotes();
  await expect(page.getByRole("heading", { name: "A fresh lecture folder" })).toBeVisible();
  await expect(card(page, "Remove from editor")).toHaveCount(0);
});

test("Test 3 - a collaborator can't open a shared note after the owner deletes it", async ({ page }) => {
  const studentA = "notely-student-a@example.edu";
  const studentB = "notely-student-b@example.edu";
  await signUp(page, "Student B", studentB);
  await logOut(page);
  await signUp(page, "Student A", studentA);
  await createNote(page, "Shared study guide");
  await card(page, "Shared study guide").click();
  const noteUrl = page.url();
  await page.getByRole("combobox", { name: "Visibility", exact: true }).selectOption("shared");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Invite collaborator", exact: true }).click();
  const invite = page.getByRole("dialog", { name: "Invite collaborator" });
  await invite.getByLabel("Classmate's email").fill(studentB);
  await invite.getByRole("button", { name: "Send invitation" }).click();
  await expect(invite).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Collaborators", exact: true })).toContainText("Student B");
  await page.getByLabel("Add a comment").fill("Read chapter 2 first.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Read chapter 2 first.")).toBeVisible();
  await logOut(page);

  await logIn(page, studentB);
  await page.goto(noteUrl);
  await expect(page.getByLabel("Note title")).toHaveValue("Shared study guide");
  await expect(page.getByText("Read chapter 2 first.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete note", exact: true })).toHaveCount(0);
  await logOut(page);

  await logIn(page, studentA);
  await page.goto(noteUrl);
  await confirmDelete(page, "Delete note");
  await expect(page).toHaveURL(/\/notes$/);
  await logOut(page);

  await logIn(page, studentB);
  await expect(card(page, "Shared study guide")).toHaveCount(0);
  await page.goto(noteUrl);
  await expect(page.getByRole("heading", { name: "We couldn’t open that note" })).toBeVisible();
  await expect(page.getByLabel("Note title")).toHaveCount(0);
  await expect(page.getByText("Read chapter 2 first.")).toHaveCount(0);
});
