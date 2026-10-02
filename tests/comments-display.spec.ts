import { test, expect } from "@playwright/test";
async function demo(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
}
test("Test 1 - display existing comments, loading state, oldest to newest", async ({
  page,
}) => {
  await demo(page);
  await page.goto("/notes/note-1");
  await page.getByRole("button", { name: "Comments" }).click();
  await page.getByText("Prototype preview options").click();
  await page
    .getByLabel("Comment loading")
    .selectOption({ label: "Loads slowly" });
  await expect(page.getByText("Loading comments…")).toBeVisible();
  const comments = page.locator("article");
  await expect(comments).toHaveCount(2, { timeout: 3000 });
  await expect(comments.nth(0).locator("strong")).toHaveText("Jamie");
  await expect(comments.nth(0).locator("p")).toHaveText("This explanation helped me.");
  await expect(comments.nth(0).locator("small")).not.toBeEmpty();
  await expect(comments.nth(1).locator("strong")).toHaveText("Alex Morgan");
});
test("Test 2 - empty state, then a failed load shows an alert with retry", async ({
  page,
}) => {
  await demo(page);
  await page.goto("/notes/note-3");
  await page.getByRole("button", { name: "Comments" }).click();
  await expect(page.getByText("Be the first to add a thought.")).toBeVisible();
  await page.getByText("Prototype preview options").click();
  await page
    .getByLabel("Comment loading")
    .selectOption({ label: "Fails to load" });
  await expect(page.getByRole("alert")).toContainText(
    "Comments could not be loaded.",
  );
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});
test("Test 3 - a comment body renders as plain text, not executable markup", async ({
  page,
}) => {
  let dialogFired = false;
  page.on("dialog", (dialog) => {
    dialogFired = true;
    void dialog.dismiss();
  });
  await demo(page);
  await page.goto("/notes/note-1");
  await page.getByRole("button", { name: "Comments" }).click();
  const payload = '<script>alert("test")</script>';
  await page.getByLabel("Add a comment").fill(payload);
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText(payload, { exact: false })).toBeVisible();
  const injectedScript = page.locator('article script:has-text("test")');
  await expect(injectedScript).toHaveCount(0);
  expect(dialogFired).toBe(false);
});
