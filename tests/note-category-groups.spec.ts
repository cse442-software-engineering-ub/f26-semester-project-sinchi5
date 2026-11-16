import { type Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";

// Card 42: notes grouped under category headings, and finding notes by category.
// Each test starts from a new account (mocked account API) so the counts are exact.
const password = "Sample meadow password 42!";

async function register(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByLabel("Your name").fill("Jamie");
  await page.getByLabel("Email address").fill("jamie@example.edu");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "I’ll do this later" }).click();
  await page.getByRole("button", { name: "Let’s begin" }).click();
  await expect(page.getByRole("heading", { name: /Good .*Jamie/ })).toBeVisible();
}

async function createNote(page: Page, title: string, category = "School") {
  await page.goto("/notes");
  await page.getByRole("button", { name: "Create Note" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Note" });
  await dialog.getByLabel("Note title").fill(title);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  if (category !== "School") {
    await page.getByRole("heading", { name: title, exact: true }).click();
    await page.getByLabel("Category").selectOption(category);
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  }
}

const group = (page: Page, name: string) => page.getByRole("region", { name });
const noteTitles = (page: Page) => page.getByRole("heading", { level: 3 }).allInnerTexts();

async function chooseCategory(page: Page, category: string) {
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Category").selectOption(category);
}

test("Test 1 - group notes under category headings with counts", async ({ page }) => {
  await register(page);
  await createNote(page, "Algebra review");
  await createNote(page, "Physics lab");
  await createNote(page, "Sprint plan", "Work");
  await createNote(page, "Project minutes", "Meetings");
  await page.goto("/notes");

  await expect(page.getByRole("heading", { name: "School (2)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work (1)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meetings (1)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Personal \(/ })).toHaveCount(0);

  const headings = await page.getByRole("heading", { level: 2 }).allInnerTexts();
  expect(headings).toEqual(["School (2)", "Work (1)", "Meetings (1)"]);
  expect((await group(page, "School (2)").getByRole("heading", { level: 3 }).allInnerTexts()).sort()).toEqual(["Algebra review", "Physics lab"]);
  expect(await group(page, "Work (1)").getByRole("heading", { level: 3 }).allInnerTexts()).toEqual(["Sprint plan"]);
  expect(await group(page, "Meetings (1)").getByRole("heading", { level: 3 }).allInnerTexts()).toEqual(["Project minutes"]);
  expect((await noteTitles(page)).sort()).toEqual(["Algebra review", "Physics lab", "Project minutes", "Sprint plan"]);
});

test("Test 2 - find notes with the category filter and search, and keep the filter on reload", async ({ page }) => {
  await register(page);
  await createNote(page, "Project outline");
  await createNote(page, "Project minutes", "Meetings");
  await createNote(page, "Weekly agenda", "Meetings");
  await page.goto("/notes");

  await chooseCategory(page, "Meetings");
  await expect(page.getByRole("heading", { name: "Meetings (2)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^School \(/ })).toHaveCount(0);
  expect((await noteTitles(page)).sort()).toEqual(["Project minutes", "Weekly agenda"]);

  await page.getByLabel("Search notes").fill("Project");
  await expect(page.getByRole("heading", { name: "Meetings (1)" })).toBeVisible();
  expect(await noteTitles(page)).toEqual(["Project minutes"]);

  await page.getByLabel("Search notes").fill("");
  await expect(page.getByRole("heading", { name: "Meetings (2)" })).toBeVisible();
  expect((await noteTitles(page)).sort()).toEqual(["Project minutes", "Weekly agenda"]);
  await expect(page.getByLabel("Category")).toHaveValue("Meetings");
  expect(new URL(page.url()).searchParams.get("category")).toBe("Meetings");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Meetings (2)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^School \(/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByLabel("Category")).toHaveValue("Meetings");
});

test("Test 3 - an empty category names the category and offers New note", async ({ page }) => {
  await register(page);
  await createNote(page, "Algebra review");
  await page.goto("/notes");

  await chooseCategory(page, "Personal");
  // No note cards (each card links to /notes/<id>); the empty-state title is the only heading.
  await expect(page.locator('a[href*="/notes/"]')).toHaveCount(0);
  await expect(page.getByRole("region")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No Personal notes yet" })).toBeVisible();
  await page.getByRole("button", { name: "New note" }).click();

  const dialog = page.getByRole("dialog", { name: "Create Note" });
  await expect(dialog).toContainText("This note will be saved in Personal.");
  await dialog.getByLabel("Note title").fill("Diary entry");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { name: "Personal (1)" })).toBeVisible();
  expect(await group(page, "Personal (1)").getByRole("heading", { level: 3 }).allInnerTexts()).toEqual(["Diary entry"]);
});

test("a search with no matches inside a category keeps the general message", async ({ page }) => {
  await register(page);
  await createNote(page, "Algebra review");
  await page.goto("/notes?category=School&q=nothing-matches");
  await expect(page.getByRole("heading", { name: "No notes found" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New note" })).toHaveCount(0);
});

test("a note moved between categories appears exactly once, under its latest category", async ({ page }) => {
  await register(page);
  await createNote(page, "Moving note", "Meetings");
  await page.getByLabel("Category").selectOption("Work");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.getByLabel("Category").selectOption("Personal");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.goto("/notes");
  await expect(page.getByRole("heading", { name: "Personal (1)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^(Meetings|Work) \(/ })).toHaveCount(0);
  expect(await noteTitles(page)).toEqual(["Moving note"]);
});

test("a note created normally lands in School", async ({ page }) => {
  await register(page);
  await createNote(page, "Plain note");
  await page.goto("/notes");
  await expect(page.getByRole("heading", { name: "School (1)" })).toBeVisible();
  expect(await group(page, "School (1)").getByRole("heading", { level: 3 }).allInnerTexts()).toEqual(["Plain note"]);
});
