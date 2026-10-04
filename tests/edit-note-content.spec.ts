import { test, expect } from "./support/account-fixture";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("notely-data-v1")!);
    const note = data.notes.find((note: { id: string }) => note.id === "note-1");
    note.body = "Original note content.";
    note.pinned = false;
    localStorage.setItem("notely-data-v1", JSON.stringify(data));
  });
  await page.goto("/notes/note-1");
  await expect(page.getByLabel("Note body")).toHaveValue("Original note content.");
});

test("existing content is editable but typing and metadata saves do not persist the body", async ({ page }) => {
  await expect(page.getByLabel("Note body")).toBeEditable();
  await page.getByLabel("Note body").fill("Unsaved draft.");
  await page.getByLabel("Note title").fill("Metadata still saves");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("notely-data-v1")!).notes.find((n: { id: string }) => n.id === "note-1").title)).toBe("Metadata still saves");
  await page.getByRole("button", { name: "Pin note", exact: true }).click();
  await expect(page.getByLabel("Note body")).toHaveValue("Unsaved draft.");
  await page.getByRole("link", { name: "All notes", exact: true }).click();
  await page.goto("/notes/note-1");
  await expect(page.getByLabel("Note body")).toHaveValue("Original note content.");
});

test("Save persists updated body when reopening and reloading", async ({ page }) => {
  await page.getByLabel("Note body").fill("Updated note content.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "All notes", exact: true }).click();
  await page.goto("/notes/note-1");
  await expect(page.getByLabel("Note body")).toHaveValue("Updated note content.");
  await page.reload();
  await expect(page.getByLabel("Note body")).toHaveValue("Updated note content.");
});

test("failed repository save keeps the editor and draft for retry", async ({ page }) => {
  await page.getByLabel("Note body").fill("Updated note content.");
  // Mock a failed local repository write at its existing storage boundary.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "notely-data-v1") {
        Storage.prototype.setItem = original;
        throw new Error("Mocked storage failure");
      }
      original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Changes could not be saved");
  await expect(page).toHaveURL(new RegExp("/notes/note-1$"));
  await expect(page.getByLabel("Note body")).toHaveValue("Updated note content.");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("notely-data-v1")!).notes.find((n: { id: string }) => n.id === "note-1").body)).toBe("Original note content.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Note body")).toHaveValue("Updated note content.");
});

test("Cancel discards only the unsaved body and reopening keeps the saved baseline", async ({ page }) => {
  await page.getByLabel("Note body").fill("Updated note content.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();

  await page.getByLabel("Note body").fill("Discarded draft.");

  // Wait longer than the old 600ms autosave delay to prove body typing
  // is no longer persisted automatically.
  await page.waitForTimeout(800);

  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("notely-data-v1")!).notes.find(
          (n: { id: string }) => n.id === "note-1",
        ).body,
    ),
  ).toBe("Updated note content.");

  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await expect(page.getByLabel("Note body")).toHaveValue(
    "Updated note content.",
  );

  await page.getByRole("link", { name: "All notes", exact: true }).click();
  await page.goto("/notes/note-1");

  await expect(page.getByLabel("Note body")).toHaveValue(
    "Updated note content.",
  );
});
