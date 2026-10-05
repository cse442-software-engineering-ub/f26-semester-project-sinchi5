import { test, expect, type Page } from "@playwright/test";

// Card 118 runs against the demo workspace's browser repository, seeded per test.
type Seed = { title: string; ownerId?: string };

async function seed(page: Page, notes: Seed[], url: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await page.evaluate((notes) => {
    const data = JSON.parse(localStorage.getItem("notely-data-v1")!);
    const template = data.notes[0];
    data.notes = notes.map((note, i) => ({
      ...template,
      id: `seed-${i}`,
      title: note.title,
      body: "",
      pinned: false,
      visibility: note.ownerId ? "shared" : "private",
      ownerId: note.ownerId ?? "student",
    }));
    data.comments = [];
    data.versions = [];
    localStorage.setItem("notely-data-v1", JSON.stringify(data));
  }, notes);
  await page.goto(url);
}

async function deleteFromCard(page: Page, title: string) {
  await page.getByRole("button", { name: `Delete ${title}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this note?" });
  await expect(dialog).toBeVisible();
  return dialog;
}

const card = (page: Page, title: string) => page.getByRole("heading", { name: title, exact: true });

test("Test 1 - deleting from a card removes it without opening the note", async ({ page }) => {
  await seed(page, [{ title: "Biology lab draft" }, { title: "Calculus review" }, { title: "Meeting agenda" }], "/notes");
  await expect(page.getByText("3 notes in your space")).toBeVisible();
  const dialog = await deleteFromCard(page, "Calculus review");
  await expect(page).toHaveURL(/\/notes$/);
  await dialog.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card(page, "Calculus review")).toHaveCount(0);
  await expect(card(page, "Biology lab draft")).toBeVisible();
  await expect(card(page, "Meeting agenda")).toBeVisible();
  await expect(page.getByText("2 notes in your space")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Note deleted." })).toBeVisible();
});

test("Test 2 - deleting keeps the search, sort, and view", async ({ page }) => {
  await seed(page, [{ title: "Algebra review" }, { title: "Calculus review" }], "/notes?q=review&sort=title&view=list");
  let dialog = await deleteFromCard(page, "Calculus review");
  await dialog.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(card(page, "Calculus review")).toHaveCount(0);
  for (const param of ["q=review", "sort=title", "view=list"]) await expect(page).toHaveURL(new RegExp(param));
  await expect(card(page, "Algebra review")).toBeVisible();
  await expect(page.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
  dialog = await deleteFromCard(page, "Algebra review");
  await dialog.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No notes found" })).toBeVisible();
  await expect(page.getByLabel("Search notes")).toHaveValue("review");
});

test("Test 3 - a failed delete keeps the card and shows an alert", async ({ page }) => {
  await seed(page, [{ title: "Biology lab draft" }, { title: "Calculus review" }, { title: "Meeting agenda" }], "/notes");
  // Mock a failed repository delete at its storage boundary.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "notely-data-v1") throw new Error("Mocked storage failure");
      return original.call(this, key, value);
    };
  });
  const dialog = await deleteFromCard(page, "Calculus review");
  await dialog.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("This note could not be deleted.");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card(page, "Calculus review")).toBeVisible();
  await expect(page.getByText("3 notes in your space")).toBeVisible();
});

test("Test 4 - only notes the user owns offer a Delete action", async ({ page }) => {
  await seed(page, [{ title: "My study plan" }, { title: "Shared by a classmate", ownerId: "another-student" }], "/notes");
  await expect(card(page, "Shared by a classmate")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete My study plan", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Shared by a classmate", exact: true })).toHaveCount(0);
});
