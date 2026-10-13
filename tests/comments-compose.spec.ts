import { test, expect } from "@playwright/test";
async function demo(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
}
test("Test 1 - post and display, rejects rapid duplicate clicks", async ({
  page,
}) => {
  await demo(page);
  await page.goto("/notes/note-1");
  await page.getByRole("button", { name: "Comments" }).click();
  const field = page.getByLabel("Add a comment");
  const postButton = page.getByRole("button", { name: "Post comment" });
  await expect(field).toBeVisible();
  await expect(postButton).toBeDisabled();
  await page.getByText("Prototype preview options").click();
  await page
    .getByLabel("Comment posting")
    .selectOption({ label: "Posts slowly" });
  await field.fill("This example makes the concept clear.");
  await expect(postButton).toBeEnabled();
  // Dispatch two native clicks in the same tick, before React can even
  // apply the disabled attribute, to test the actual race rather than
  // two Playwright-paced clicks that would never overlap in practice.
  await postButton.evaluate((el: HTMLButtonElement) => {
    el.click();
    el.click();
  });
  await expect(page.getByText("Posting…")).toBeVisible();
  await expect(
    page.locator("article", { hasText: "This example makes the concept clear." }),
  ).toHaveCount(1, { timeout: 3000 });
  const posted = page.locator("article", {
    hasText: "This example makes the concept clear.",
  });
  await expect(posted.locator("strong")).toHaveText("Erin");
  await expect(posted.locator("small")).not.toBeEmpty();
  await expect(field).toHaveValue("");
});
test("Test 2 - validate: whitespace, over-limit, and exactly-2000 boundary", async ({
  page,
}) => {
  await demo(page);
  await page.goto("/notes/note-1");
  await page.getByRole("button", { name: "Comments" }).click();
  const field = page.getByLabel("Add a comment");
  const postButton = page.getByRole("button", { name: "Post comment" });
  await field.fill("   ");
  await expect(postButton).toBeDisabled();
  await field.fill("a".repeat(2001));
  await expect(page.getByText("2,001 / 2,000")).toBeVisible();
  await expect(postButton).toBeDisabled();
  await field.fill("a".repeat(2000));
  await expect(page.getByText("2,000 / 2,000")).toBeVisible();
  await expect(postButton).toBeEnabled();
});
test("Test 3 - a failed post keeps the draft, retry shows exactly one comment", async ({
  page,
}) => {
  await demo(page);
  await page.goto("/notes/note-1");
  await page.getByRole("button", { name: "Comments" }).click();
  await page.getByText("Prototype preview options").click();
  await page
    .getByLabel("Comment posting")
    .selectOption({ label: "Fails to post" });
  const field = page.getByLabel("Add a comment");
  await field.fill("Please clarify the second paragraph.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your comment could not be posted.",
  );
  await expect(field).toHaveValue("Please clarify the second paragraph.");
  await page
    .getByLabel("Comment posting")
    .selectOption({ label: "Posts normally" });
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(
    page.locator("article", {
      hasText: "Please clarify the second paragraph.",
    }),
  ).toHaveCount(1);
});
