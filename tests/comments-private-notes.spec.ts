import { test, expect } from "@playwright/test";
async function demo(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
}
test("Test 1 - a private note hides commenting controls", async ({ page }) => {
  await demo(page);
  await page.goto("/notes/note-2");
  await page.getByRole("button", { name: "Comments" }).click();
  await expect(page.getByText("Just for you")).toBeVisible();
  await expect(
    page.getByText("Make this note shared to start a conversation."),
  ).toBeVisible();
  await expect(page.getByLabel("Add a comment")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Post comment" })).not.toBeVisible();
});
test("Test 2 - controls appear after Private to Shared, disappear after switching back", async ({
  page,
}) => {
  await demo(page);
  await page.goto("/notes/note-2");
  await page.getByRole("button", { name: "Comments" }).click();
  await page.getByLabel("Visibility").selectOption("shared");
  await expect(page.getByLabel("Add a comment")).toBeVisible();
  await page.getByLabel("Visibility").selectOption("private");
  await expect(page.getByText("Just for you")).toBeVisible();
  await expect(page.getByLabel("Add a comment")).not.toBeVisible();
});
test("Test 3 (extra) - posting before the visibility save lands is rejected safely", async ({
  page,
}) => {
  await page.clock.install();
  await demo(page);
  await page.goto("/notes/note-2");
  await page.getByRole("button", { name: "Comments" }).click();
  await page.getByLabel("Visibility").selectOption("shared");
  // The debounced save is paused by the fake clock, so the persisted
  // note is still private even though the composer already shows.
  const field = page.getByLabel("Add a comment");
  await expect(field).toBeVisible();
  await field.fill("Quick thought before the save lands.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Share this note before adding comments.",
  );
  await expect(field).toHaveValue("Quick thought before the save lands.");
  // Nothing crashed: the rest of the page is still fully usable.
  await expect(page.getByLabel("Note title")).toBeVisible();
});
