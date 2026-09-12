import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function demo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
}
async function upload(page: Page, kind: string, name = "lecture.pdf") {
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: kind, exact: true }).click();
  await page.getByLabel("Choose upload file").setInputFiles({
    name,
    mimeType: name.endsWith(".png") ? "image/png" : "application/pdf",
    buffer: Buffer.from("example file"),
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
}
test("account and complete onboarding", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByLabel("Your name").fill("Jamie");
  await page.getByLabel("Email address").fill("jamie@example.edu");
  await page.getByLabel("Password", { exact: true }).fill("samplepassword");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByRole("button", { name: "Add your own course" }).click();
  await page.getByLabel("Course code").fill("ART 101");
  await page.getByLabel("Course name").fill("Ways of Seeing");
  await page.getByRole("button", { name: "Add course", exact: true }).click();
  await expect(page.getByText("ART 101", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Looks good" }).click();
  await page.getByRole("button", { name: "I’ll do this later" }).click();
  await page.getByRole("button", { name: "Let’s begin" }).click();
  await expect(page.getByRole("heading", { name: /Jamie/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Jamie/ })).toBeVisible();
});
test("search, combined filters, clear and view persistence", async ({
  page,
}) => {
  await demo(page);
  await page.goto("/notes");
  await page.getByLabel("Search notes").fill("scrum");
  await expect(
    page.getByRole("heading", {
      name: "Agile development & the Scrum framework",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Visibility", exact: true })
    .selectOption("private");
  await expect(
    page.getByRole("heading", { name: "No notes found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear all" }).click();
  await page.getByLabel("Sort notes").selectOption("title");
  await page.getByRole("button", { name: "List view" }).click();
  await page.reload();
  await expect(page.getByLabel("Sort notes")).toHaveValue("title");
  await expect(page.getByRole("button", { name: "List view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
test("manual event and lecture folder", async ({ page }) => {
  await demo(page);
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Study together");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(
    page.getByRole("button", { name: /Study together/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /10:00.*Software Engineering/ })
    .click();
  await page.getByRole("link", { name: "Open lecture notes" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Agile development & the Scrum framework",
    }),
  ).toBeVisible();
});
test("note edits, comments, history and reload", async ({ page }) => {
  await demo(page);
  await page.goto("/notes/note-1");
  await page.getByLabel("Note body").fill("A revised explanation of Scrum.");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Add a comment").fill("This really helped.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("This really helped.")).toBeVisible();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("button", { name: /Preview version/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Restore version" }).click();
  await page.getByRole("button", { name: "Confirm restore" }).click();
  await expect(page.getByLabel("Note body")).not.toHaveValue(
    "A revised explanation of Scrum.",
  );
  await page.reload();
  await expect(page.getByLabel("Note body")).not.toHaveValue(
    "A revised explanation of Scrum.",
  );
});
test("upload documents and scan, syllabus reviewed events", async ({
  page,
}) => {
  await demo(page);
  await upload(page, "Upload document");
  await page.getByLabel("Title", { exact: true }).fill("Imported lecture");
  await page.getByRole("button", { name: "Save to my notes" }).click();
  await page.getByRole("button", { name: "All done" }).click();
  await page.goto("/notes?q=Imported%20lecture");
  await expect(
    page.getByRole("heading", { name: "Imported lecture" }),
  ).toBeVisible();
  await upload(page, "Scan photos", "handwriting.png");
  await page.getByRole("button", { name: "Save to my notes" }).click();
  await page.getByRole("button", { name: "All done" }).click();
  await upload(page, "Upload syllabus", "syllabus.pdf");
  await page.getByLabel("Event title").first().fill("Review project proposal");
  await page.getByRole("button", { name: "Add to schedule" }).click();
  await page.getByRole("button", { name: "All done" }).click();
  await page.goto("/courses/cse442");
  await expect(page.getByText("Review project proposal")).toBeVisible();
});
test("dialog keyboard behavior and theme persistence", async ({ page }) => {
  await demo(page);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Upload document", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
test("responsive layout and accessibility", async ({ page }) => {
  await demo(page);
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/notes");
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});
test("new note saves when leaving immediately", async ({ page }) => {
  await demo(page);
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Note title").fill("A brand-new idea");
  await page
    .getByLabel("Note body")
    .fill("Keep this even if I leave right away.");
  await page.getByRole("link", { name: "All notes", exact: true }).click();
  await page.getByRole("heading", { name: "A brand-new idea" }).click();
  await expect(page.getByLabel("Note body")).toHaveValue(
    "Keep this even if I leave right away.",
  );
  await page.reload();
  await expect(page.getByLabel("Note body")).toHaveValue(
    "Keep this even if I leave right away.",
  );
});
test("invalid uploads and failure recovery", async ({ page }) => {
  await demo(page);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Upload document", exact: true })
    .click();
  await page
    .getByLabel("Choose upload file")
    .setInputFiles({
      name: "wrong.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("sample"),
    });
  await expect(page.getByRole("alert")).toContainText("Choose a PDF");
  await page
    .getByLabel("Choose upload file")
    .setInputFiles({
      name: "retry.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("sample"),
    });
  await page.getByText("Prototype preview options", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Processing result" })
    .selectOption("failure");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "That file needs another try" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("retry");
});
