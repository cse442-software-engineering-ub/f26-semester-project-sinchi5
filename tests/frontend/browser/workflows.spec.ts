import { type Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";
import AxeBuilder from "@axe-core/playwright";
import { openNew, openSettings } from "./support/shell";
import { register, createCourse } from "./support/task35";

const lecture = {
  title: "Agile development & the Scrum framework", body: "Transparency in planning.",
  tags: ["teamwork"], visibility: "shared", lectureDate: "2026-09-14",
};

async function seedNote(page: Page, fields: object): Promise<string> {
  return page.evaluate(async body => {
    const response = await fetch("/api/index.php?route=note-create", {
      method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": "fixture-csrf" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()).note.id;
  }, fields);
}
// Real (empty) files, since a syllabus's contents must match its name (card 45).
const EMPTY_PDF = "%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n2 0 obj <</Type/Pages/Kids[]/Count 0>> endobj\n"
  + "trailer <</Root 1 0 R>>\n%%EOF\n";
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
async function upload(page: Page, kind: "Upload document" | "Scan photos" | "Upload syllabus", name = "lecture.pdf") {
  await openNew(page, kind);
  await page.getByLabel("Choose upload file").setInputFiles({
    name,
    mimeType: name.endsWith(".png") ? "image/png" : "application/pdf",
    buffer: name.endsWith(".png") ? Buffer.from(PNG_1PX, "base64") : Buffer.from(EMPTY_PDF),
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // The review form ends with "Save to my notes", or "Add to schedule" for a syllabus (card 46).
  await expect(page.getByRole("button", { name: /^(Save to my notes|Add to schedule)/ })).toBeVisible();
}
test("the left menu is navigation only and Settings lives in the account menu", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await register(page);
  const sidebar = page.locator("aside");
  const greeting = await page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }).innerText();
  await expect(sidebar.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "Log out" })).toHaveCount(0);
  for (const [link, heading] of [["Schedule", "Your schedule"], ["Notes", "Your notes"], ["Courses", "Courses"], ["Today", greeting]]) {
    await sidebar.getByRole("link", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: link, exact: true })).toHaveAttribute("aria-current", "page");
  }
  await openSettings(page);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
});

test("account and complete onboarding", async ({ page }) => {
  const email = await register(page);
  const courseId = await createCourse(page, "ART 101", "Ways of Seeing");
  await page.reload();
  await expect(page.getByRole("heading", { name: /Jamie/ })).toBeVisible();
  await openSettings(page);
  await expect(page.getByText(email, { exact: true }).first()).toBeVisible();
  await page.goto(`/courses/${courseId}`);
  await expect(page.getByRole("heading", { name: "Ways of Seeing" })).toBeVisible();
});
test("search, combined filters, clear and view persistence", async ({
  page,
}) => {
  await register(page);
  const courseId = await createCourse(page);
  await seedNote(page, { ...lecture, courseId });
  await seedNote(page, { title: "Linear algebra", body: "Matrix operations", visibility: "private" });
  await page.goto("/notes");
  await page.getByLabel("Search notes").fill("scrum");
  await expect(page).toHaveURL(/\bq=scrum\b/);
  await expect(
    page.getByRole("heading", {
      name: "Agile development & the Scrum framework",
    }),
  ).toBeVisible();
  await expect(page.locator('a[href^="/notes/"] h3')).toHaveCount(1);
  await page.getByLabel("Search notes").fill("transparency");
  await expect(page.locator('a[href^="/notes/"] h3')).toHaveText(["Agile development & the Scrum framework"]);
  await page.getByLabel("Search notes").fill("teamwork");
  await expect(page.locator('a[href^="/notes/"] h3')).toHaveText(["Agile development & the Scrum framework"]);
  await page.getByLabel("Search notes").fill("CSE 442");
  await expect(page.getByRole("heading", { name: "No notes found" })).toBeVisible();
  await page.getByLabel("Search notes").fill("scrum");
  await page.reload();
  await expect(page.getByLabel("Search notes")).toHaveValue("scrum");
  await expect(page.locator('a[href^="/notes/"] h3')).toHaveText(["Agile development & the Scrum framework"]);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Visibility", exact: true })
    .selectOption("private");
  await expect(
    page.getByRole("heading", { name: "No notes found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.locator('a[href^="/notes/"] h3')).toHaveCount(2);
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
  await register(page);
  const courseId = await createCourse(page);
  const noteId = await seedNote(page, { ...lecture, courseId });
  await page.goto(`/schedule?view=month&date=${lecture.lectureDate}`);
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Study together");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(
    page.getByRole("button", { name: /Study together/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Study together/ })
    .click();
  await page.getByRole("link", { name: "Open lecture notes" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Agile development & the Scrum framework",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: new RegExp(lecture.title) }).click();
  await expect(page).toHaveURL(new RegExp(`/notes/${noteId}$`));
  await expect(page.getByLabel("Note body")).toHaveText(lecture.body);
});
test("note edits, comments, history and reload", async ({ page }) => {
  await register(page);
  const noteId = await seedNote(page, lecture);
  await page.goto(`/notes/${noteId}`);
  await page.getByLabel("Note body").fill("A revised explanation of Scrum.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page.getByLabel("Add a comment").fill("This really helped.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("This really helped.")).toBeVisible();
  await page.locator("#note-people").getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("button", { name: /Preview version/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Restore version" }).click();
  await page.getByRole("button", { name: "Confirm restore" }).click();
  await expect(page.getByLabel("Note body")).toHaveText(lecture.body);
  await page.reload();
  await expect(page.getByLabel("Note body")).toHaveText(lecture.body);
});
test("upload documents and scan, syllabus reviewed events", async ({
  page,
}) => {
  await register(page);
  const courseId = await createCourse(page);
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
  await page.goto("/notes?q=handwriting");
  await expect(page.getByRole("heading", { name: "handwriting" })).toBeVisible();
  await upload(page, "Upload syllabus", "syllabus.pdf");
  await expect(page.getByLabel("Event title").first()).toHaveValue("Reading response 1");
  await page.getByLabel("Event title").first().fill("Review project proposal");
  await page.getByRole("button", { name: "Add to schedule" }).click();
  await page.getByRole("button", { name: "All done" }).click();
  await page.goto(`/courses/${courseId}`);
  await expect(page.getByText("Review project proposal")).toBeVisible();
});
test("dialog keyboard behavior and theme persistence", async ({ page }) => {
  await register(page);
  await openNew(page, "Upload document");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await openSettings(page);
  await page.getByRole("link", { name: /^Appearance/ }).click();
  await page.getByLabel("Dark", { exact: true }).check();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Light", { exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
test("responsive layout and accessibility", async ({ page }) => {
  await register(page);
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
test("new note saves explicitly before leaving", async ({ page }) => {
  await register(page);
  await openNew(page, "Note");
  const titleSaved = page.waitForResponse(r => new URL(r.url()).searchParams.get("route") === "note-save");
  await page.getByLabel("Note title").fill("A brand-new idea");
  expect(await (await titleSaved).json()).toMatchObject({ note: { title: "A brand-new idea" } });
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page
    .getByLabel("Note body")
    .fill("Keep this even if I leave right away.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "All notes", exact: true }).click();
  await page.getByRole("heading", { name: "A brand-new idea" }).click();
  await expect(page.getByLabel("Note body")).toHaveText(
    "Keep this even if I leave right away.",
  );
  await page.reload();
  await expect(page.getByLabel("Note body")).toHaveText(
    "Keep this even if I leave right away.",
  );
});
test("invalid uploads and failure recovery", async ({ page }) => {
  await register(page);
  await openNew(page, "Upload document");
  await page
    .getByLabel("Choose upload file")
    .setInputFiles({
      name: "wrong.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("sample"),
    });
  await expect(page.getByRole("alert")).toContainText("Choose a PDF");
  const fileInput = page.getByLabel("Choose upload file");
  await fileInput.setInputFiles({
    name: "retry.txt", mimeType: "text/plain", buffer: Buffer.from("Recovered lecture material."),
  });
  // Fail the first read of this selected File, then retry through its native text reader.
  await fileInput.evaluate(input => {
    const file = (input as HTMLInputElement).files![0];
    Object.defineProperty(file, "text", { configurable: true, value: async () => {
      Reflect.deleteProperty(file, "text");
      throw new DOMException("Read failed", "NotReadableError");
    } });
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "That file needs another try" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("This file could not be read");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("retry");
  await page.getByRole("button", { name: "Save to my notes" }).click();
  await page.getByRole("button", { name: "All done" }).click();
  await page.goto("/notes");
  await page.getByRole("link", { name: /retry/ }).click();
  await expect(page.getByLabel("Note body")).toHaveText("Recovered lecture material.");
});
