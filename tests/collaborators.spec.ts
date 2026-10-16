import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await page.goto("/notes/note-1");
});

async function open(page: Page) {
  await page.getByRole("button", { name: "Invite collaborator", exact: true }).click();
  return page.getByRole("dialog", { name: "Invite collaborator" });
}

test("opens and closes via cancel, close control, and Escape", async ({ page }) => {
  for (const action of ["Cancel", "Close", "Escape"]) {
    const dialog = await open(page);
    await expect(dialog).toBeVisible();
    if (action === "Escape") await page.keyboard.press("Escape");
    else await dialog.getByRole("button", { name: action, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Invite collaborator", exact: true })).toBeFocused();
  }
});

test("invalid email stays inline and adds no collaborator", async ({ page }) => {
  const dialog = await open(page);
  await dialog.getByLabel("Classmate's email").fill("not-an-email");
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Enter a valid email address.");
  await expect(page.getByRole("region", { name: "Collaborators", exact: true }).getByRole("listitem")).toHaveCount(0);
});

test("success updates the list once, preserves edits, and prevents pending resubmission", async ({ page }) => {
  await page.getByLabel("Note body").fill("Keep this edit during invitation.");
  const dialog = await open(page);
  await dialog.getByLabel("Classmate's email").fill("jamie@example.edu");
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog.getByRole("button", { name: "Sending...", exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("Classmate's email")).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await dialog.locator("form").evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.clock.runFor(1000);
  await expect(dialog).toHaveCount(0);
  const rows = page.getByRole("region", { name: "Collaborators", exact: true }).getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Jamie");
  await expect(rows).toContainText("jamie@example.edu");
  await expect(rows).toContainText("Pending");
  await expect(page.getByLabel("Note body")).toHaveValue("Keep this edit during invitation.");
  await open(page);
  await dialog.getByLabel("Classmate's email").fill("Jamie@Example.edu");
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await page.clock.runFor(1000);
  await expect(dialog).toHaveCount(0);
  await expect(rows).toHaveCount(1);
});

test("unregistered response retains email and allows a successful retry", async ({ page }) => {
  const dialog = await open(page);
  await dialog.getByLabel("Classmate's email").fill("unknown@example.edu");
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("No registered account was found for this email.");
  await expect(dialog.getByLabel("Classmate's email")).toHaveValue("unknown@example.edu");
  const rows = page.getByRole("region", { name: "Collaborators", exact: true }).getByRole("listitem");
  await expect(rows).toHaveCount(0);
  await dialog.getByLabel("Classmate's email").fill("jamie@example.edu");
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rows).toHaveCount(1);
});

test("another owner's note has no invite control", async ({ page }) => {
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("notely-data-v1")!);
    data.notes.find((note: { id: string }) => note.id === "note-1").ownerId = "another-student";
    localStorage.setItem("notely-data-v1", JSON.stringify(data));
  });
  await page.reload();
  await expect(page.getByLabel("Note title")).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite collaborator", exact: true })).toHaveCount(0);
});
