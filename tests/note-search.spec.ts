import { test, expect } from "./support/account-fixture";

test("a student's notes search matches title and body, clears, and survives reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByLabel("Your name").fill("Search Student");
  await page.getByLabel("Email address").fill("notely-search-442@example.edu");
  await page.getByLabel("Password", { exact: true }).fill("TestPassword2026!");
  await page.getByLabel("Confirm password", { exact: true }).fill("TestPassword2026!");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "I’ll do this later" }).click();
  await page.getByRole("button", { name: "Let’s begin" }).click();
  await page.goto("/notes");

  for (const [title, body] of [
    ["Photosynthesis basics", "Light, water, and carbon dioxide."],
    ["Cell division", "Mitosis has four phases."],
    ["Sprint retrospective", "What went well this sprint."],
  ]) {
    await page.getByRole("button", { name: "Create Note" }).click();
    await page.getByLabel("Note title").fill(title);
    await page.getByLabel("Note content").fill(body);
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }

  const search = page.getByLabel("Search notes");
  const titles = page.locator('a[href^="/notes/"] h3');
  await search.fill("photosynthesis");
  await expect(page).toHaveURL(/\bq=photosynthesis\b/);
  await expect(titles).toHaveText(["Photosynthesis basics"]);
  await page.getByRole("link", { name: /Photosynthesis basics/ }).click();
  await expect(page.getByLabel("Note title")).toHaveValue("Photosynthesis basics");
  await page.getByRole("link", { name: "All notes" }).click();

  await page.getByLabel("Search notes").fill("mitosis");
  await expect(titles).toHaveText(["Cell division"]);
  await page.getByLabel("Search notes").fill("quantum");
  await expect(page.getByRole("heading", { name: "No notes found" })).toBeVisible();
  await expect(titles).toHaveCount(0);
  await page.getByLabel("Search notes").fill("");
  await expect(titles).toHaveCount(3);

  await page.getByLabel("Search notes").fill("sprint");
  await expect(titles).toHaveText(["Sprint retrospective"]);
  await page.reload();
  await expect(page.getByLabel("Search notes")).toHaveValue("sprint");
  await expect(titles).toHaveText(["Sprint retrospective"]);

  await page.getByLabel("Search notes").fill("");
  await page.getByRole("button", { name: "Create Note" }).click();
  await page.getByLabel("Note title").fill("Class Notes");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await page.getByRole("link", { name: /Class Notes/ }).click();
  await page.getByLabel("Note body").fill("Binary search algorithm");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: "All notes" }).click();
  await page.getByLabel("Search notes").fill("binary");
  await expect(titles).toHaveText(["Class Notes"]);
});

test("card 54 search flow and account cleanup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByLabel("Your name").fill("Task Tester");
  await page.getByLabel("Email address").fill("notely-task54-442@example.edu");
  await page.getByLabel("Password", { exact: true }).fill("Sample river password 42!");
  await page.getByLabel("Confirm password", { exact: true }).fill("Sample river password 42!");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "I’ll do this later" }).click();
  await page.getByRole("button", { name: "Let’s begin" }).click();

  await page.goto("/notes");
  for (const title of ["Math Homework", "Biology Review", "Class Notes"]) {
    await page.getByRole("button", { name: "Create Note" }).click();
    await page.getByLabel("Note title").fill(title);
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }

  const search = page.getByLabel("Search notes");
  const titles = page.locator('a[href^="/notes/"] h3');
  await expect(search).toHaveAttribute("placeholder", "Find a thought, a topic, a little inspiration…");
  await search.fill("Math");
  await expect(page).toHaveURL(/\bq=Math\b/);
  await expect(titles).toHaveText(["Math Homework"]);

  await search.fill("");
  await page.getByRole("link", { name: /Class Notes/ }).click();
  await page.getByLabel("Note body").fill("Binary search algorithm");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("link", { name: "All notes" }).click();
  await page.getByLabel("Search notes").fill("binary");
  await expect(titles).toHaveText(["Class Notes"]);

  await page.getByLabel("Search notes").fill("Physics123");
  await expect(page.getByRole("heading", { name: "No notes found" })).toBeVisible();
  await expect(titles).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Search notes")).toHaveValue("Physics123");
  await expect(page.getByRole("heading", { name: "No notes found" })).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByLabel("Current password").fill("Sample river password 42!");
  await page.getByLabel("I understand that deletion is permanent").check();
  await page.getByRole("button", { name: "Permanently delete account" }).click();
  await expect(page.getByRole("heading", { name: "Good to see you again." })).toBeVisible();
});
