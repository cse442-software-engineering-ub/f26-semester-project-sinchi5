import type { Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";

// Card 176 and story 174. The API fixture isolates each browser case; the real
// PHP tag and access contract is covered by backend/tests/note-tag-filter-http.mjs.
const password = "Sample river password 42!";
type Seed = { title: string; tag: string; course?: boolean };
const taskNotes: Seed[] = [
  { title: "Exam outline", tag: "exam", course: true },
  { title: "Exam review", tag: "exam" },
  { title: "Project outline", tag: "project", course: true },
];
const titles = (page: Page) => page.locator('a[href^="/notes/"] h3');
const editorCourse = (page: Page) => page.getByRole("combobox", { name: "Course", exact: true });
const filterCourse = (page: Page) => page.locator('select:has(option:text-is("All courses"))');
async function expectTitles(page: Page, expected: string[]) {
  await expect(titles(page)).toHaveCount(expected.length);
  expect((await titles(page).allInnerTexts()).sort()).toEqual([...expected].sort());
}

async function setup(page: Page, notes: Seed[] = taskNotes) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByLabel("Your name").fill("Tag Filter Tester");
  await page.getByLabel("Email address").fill("notely-task176-442@example.edu");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Add a course" }).click();
  await page.getByLabel("Course code").fill("CSE 442");
  await page.getByLabel("Term").fill("Fall 2026");
  await page.getByLabel("Course name").fill("Software Engineering");
  await page.getByRole("button", { name: "Add course", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "I’ll do this later" }).click();
  await page.getByRole("button", { name: "Let’s begin" }).click();
  await page.goto("/notes");

  for (const note of notes) {
    await page.getByRole("button", { name: "Create Note" }).click();
    const dialog = page.getByRole("dialog", { name: "Create Note" });
    await dialog.getByLabel("Note title").fill(note.title);
    await dialog.getByRole("button", { name: "Close" }).click();
    await page.getByRole("heading", { name: note.title, exact: true }).click();
    await page.getByLabel("Tags").fill(note.tag);
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    if (note.course) {
      await editorCourse(page).selectOption({ label: "CSE 442" });
      await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    }
    // Metadata autosaves; Save is disabled once the tag and course are persisted.
    await page.getByRole("link", { name: "All notes" }).click();
    await expect(page.getByRole("heading", { name: note.title, exact: true })).toBeVisible();
  }
}

async function openFilters(page: Page) {
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByLabel("Tags")).toBeVisible();
}

test("Task 1 - Tags lists each available tag once and filters exactly", async ({ page }) => {
  await setup(page);
  await openFilters(page);
  await expect(page.getByLabel("Tags").locator("option")).toHaveText(["All tags", "exam", "project"]);
  await page.getByLabel("Tags").selectOption("exam");
  await expectTitles(page, ["Exam review", "Exam outline"]);
  await expect(page.getByRole("button", { name: "Filters (1)" })).toBeVisible();
});

test("Task 2 - tag and course selections combine and survive reload", async ({ page }) => {
  await setup(page);
  await openFilters(page);
  await page.getByLabel("Tags").selectOption("exam");
  await filterCourse(page).selectOption({ label: "CSE 442" });
  await expect(titles(page)).toHaveText(["Exam outline"]);
  await expect(page.getByRole("button", { name: "Filters (2)" })).toBeVisible();
  await page.reload();
  await expect(titles(page)).toHaveText(["Exam outline"]);
  await openFilters(page);
  await expect(page.getByLabel("Tags")).toHaveValue("exam");
  await expect(filterCourse(page)).not.toHaveValue("");
});

test("Task 3 - clearing a tag preserves search, then Clear all resets both", async ({ page }) => {
  await setup(page);
  await openFilters(page);
  await page.getByLabel("Tags").selectOption("exam");
  await page.getByLabel("Search notes").fill("outline");
  await expect(titles(page)).toHaveText(["Exam outline"]);
  await page.getByRole("button", { name: "Clear tag filter exam" }).click();
  await expect(page.getByLabel("Tags")).toHaveValue("");
  await expect(page.getByLabel("Search notes")).toHaveValue("outline");
  await expectTitles(page, ["Project outline", "Exam outline"]);
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByLabel("Tags")).toHaveValue("");
  await expect(page.getByLabel("Search notes")).toHaveValue("");
  await expect(titles(page)).toHaveCount(3);
});

test("Task 4 - empty result keeps a usable tag selector and chip on a phone", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openFilters(page);
  await page.getByLabel("Tags").selectOption("exam");
  await page.getByLabel("Search notes").fill("zebra");
  await expect(page.getByRole("heading", { name: "No notes found" })).toBeVisible();
  await expect(page.getByLabel("Tags")).toHaveValue("exam");
  await expect(page.getByLabel("Tags")).toBeInViewport();
  const chip = page.getByRole("button", { name: "Clear tag filter exam" });
  await expect(chip).toBeInViewport();
  await chip.click();
  await expect(page.getByLabel("Tags")).toHaveValue("");
});

test("Story 174 - exact tag, search, and tag-only clearing", async ({ page }) => {
  await setup(page, [
    { title: "Exam outline", tag: "exam", course: true },
    { title: "Final exam guide", tag: "final exam" },
    { title: "Project plan", tag: "project", course: true },
  ]);
  await openFilters(page);
  await page.getByLabel("Tags").selectOption("exam");
  await expect(titles(page)).toHaveText(["Exam outline"]);
  await page.getByLabel("Search notes").fill("project");
  await expect(page.getByRole("heading", { name: "No notes found" })).toBeVisible();
  await page.getByRole("button", { name: "Clear tag filter exam" }).click();
  await expect(page.getByLabel("Search notes")).toHaveValue("project");
  await expect(titles(page)).toHaveText(["Project plan"]);
  await page.getByLabel("Tags").selectOption("exam");
  await page.getByLabel("Search notes").fill("");
  await page.reload();
  await expect(titles(page)).toHaveText(["Exam outline"]);
  await openFilters(page);
  await expect(page.getByLabel("Tags")).toHaveValue("exam");
});
