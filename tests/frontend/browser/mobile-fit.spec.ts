import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./support/account-fixture";
import { logOut, openSettings } from "./support/shell";

const noteTitle = "QA Field Fit";
const phoneSizes = [{ width: 320, height: 640 }, { width: 390, height: 664 }];
const textFields = 'input:not([type]), input:is([type="text"], [type="email"], [type="password"], [type="search"], [type="tel"], [type="url"], [type="number"], [type="date"], [type="time"], [type="datetime-local"], [type="month"], [type="week"]), select, textarea';

async function openRegistration(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByLabel("Your name")).toBeVisible();
}

async function register(page: Page, email = "field-fit@example.edu") {
  await page.getByLabel("Your name").fill("Field Fit Tester");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Mock field fit password 42!");
  await page.getByLabel("Confirm password").fill("Mock field fit password 42!");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Good .*Field/ })).toBeVisible();
}

async function openCourseForm(page: Page) {
  await page.goto("/courses");
  await page.getByRole("button", { name: "Add course", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add course" });
  await expect(dialog.getByLabel("Course code")).toBeVisible();
  return dialog;
}

async function saveCourse(dialog: Locator) {
  await dialog.getByLabel("Course code").fill("CSE 442");
  await dialog.getByLabel("Term").fill("Fall 2026");
  await dialog.getByLabel("Course name").fill("Software Engineering");
  await dialog.getByRole("button", { name: "Add course", exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function createNote(page: Page) {
  await page.goto("/notes");
  await page.getByRole("button", { name: "Create note", exact: true }).click();
  const title = page.getByLabel("Note title", { exact: true });
  await expect(title).toBeEditable();
  const [saved] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).searchParams.get("route") === "note-save"),
    title.fill(noteTitle),
  ]);
  expect(saved.ok()).toBe(true);
  expect(await saved.json()).toMatchObject({ note: { title: noteTitle } });
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  await page.getByRole("link", { name: "All notes" }).click();
  // Reopen through the list to prove the fixture was saved, without relying on a generated ID.
  await page.getByRole("link", { name: new RegExp(noteTitle) }).click();
  await expect(title).toHaveValue(noteTitle);
}

async function openDetails(page: Page) {
  const toggle = page.getByRole("button", { name: "Details", exact: true });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator("#note-details");
  await expect(panel.getByLabel("Lecture date", { exact: true })).toBeVisible();
  return panel;
}

async function fieldLayout(field: Locator) {
  return field.evaluate(element => {
    const box = element.getBoundingClientRect();
    const label = (element as HTMLInputElement).labels?.[0]?.textContent?.trim();
    const name = element.getAttribute("aria-label") || label || element.getAttribute("name") || element.tagName;
    const viewportWidth = document.documentElement.clientWidth;
    const clippingAncestors: string[] = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (!["hidden", "clip", "auto", "scroll"].includes(getComputedStyle(parent).overflowX)) continue;
      const left = parent.getBoundingClientRect().left + parent.clientLeft;
      if (box.left < left - 1 || box.right > left + parent.clientWidth + 1) {
        clippingAncestors.push(parent.tagName);
      }
    }
    const form = element.closest("form");
    return {
      name, fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      left: box.left, right: box.right, top: box.top, bottom: box.bottom,
      viewportWidth, clippingAncestors,
      formOverflow: form ? form.scrollWidth - form.clientWidth : 0,
    };
  });
}

async function checkField(field: Locator, minFontSize: number) {
  await expect(field).toBeVisible();
  await expect(field).toBeEnabled();
  // The editor toolbar scrolls independently. Measure each control after revealing it.
  await field.scrollIntoViewIfNeeded();
  await field.focus();
  await expect(field).toBeFocused();
  const layout = await fieldLayout(field);
  expect(layout.fontSize, layout.name).toBeGreaterThanOrEqual(minFontSize);
  expect(layout.left, layout.name).toBeGreaterThanOrEqual(-1);
  expect(layout.right, layout.name).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.clippingAncestors, layout.name).toEqual([]);
  expect(layout.formOverflow, layout.name).toBeLessThanOrEqual(0);
  return layout;
}

async function checkDocumentWidth(page: Page) {
  expect(await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  })).toBeLessThanOrEqual(0);
}

async function checkPhoneFields(page: Page, surface: string, scope: Page | Locator = page) {
  await test.step(surface, async () => {
    const fields = await scope.locator(textFields).filter({ visible: true }).all();
    expect(fields.length, surface).toBeGreaterThan(0);
    for (const field of fields) await checkField(field, 16);
    await checkDocumentWidth(page);
  });
}

async function checkMetadata(page: Page, minFontSize: number) {
  const panel = await openDetails(page);
  const layouts = [];
  for (const field of [
    panel.getByRole("combobox", { name: "Course", exact: true }),
    panel.getByLabel("Lecture date", { exact: true }),
    panel.getByRole("combobox", { name: "Category", exact: true }),
  ]) {
    layouts.push(await checkField(field, minFontSize));
  }
  await checkDocumentWidth(page);
  return { panel, layouts };
}

test("fields are at least 16px on a phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Phone-only check");
  for (const size of phoneSizes) {
    await page.setViewportSize(size);
    await test.step(`${size.width} CSS px`, async () => {
      await page.goto("/welcome?mode=signin");
      await expect(page.getByRole("heading", { name: "Good to see you again." })).toBeVisible();
      await checkPhoneFields(page, "Sign-in");

      await openRegistration(page);
      await checkPhoneFields(page, "Create account");
      await register(page, `field-fit-${size.width}@example.edu`);
      const course = await openCourseForm(page);
      await checkPhoneFields(page, "Add course", course);
      expect(await course.evaluate(dialog => dialog.scrollWidth - dialog.clientWidth)).toBeLessThanOrEqual(0);
      await saveCourse(course);

      await page.goto("/notes");
      await expect(page.getByLabel("Search notes", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      await expect(page.getByRole("group", { name: "Filter notes" })).toBeVisible();
      await checkPhoneFields(page, "Notes search and filters");

      await createNote(page);
      await expect(page.getByRole("toolbar", { name: "Formatting" })).toBeVisible();
      await checkPhoneFields(page, "Full note editor");
      await checkPhoneFields(page, "Note Details", await openDetails(page));

      await page.goto("/schedule?view=month");
      await page.getByRole("button", { name: "Add event", exact: true }).click();
      const event = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Create event", exact: true }) });
      // Use the short fixture here. The #245 long-title picker is a separate regression.
      await expect(event.getByRole("button", { name: new RegExp(noteTitle) })).toBeVisible();
      await checkPhoneFields(page, "Add event", event);
      await page.keyboard.press("Escape");
      await expect(event).toBeHidden();

      await openSettings(page);
      await page.getByRole("button", { name: "Edit account", exact: true }).click();
      const account = page.getByRole("dialog", { name: "Edit account" });
      await expect(account.getByLabel("Current password")).toBeVisible();
      await checkPhoneFields(page, "Edit account", account);
      await page.keyboard.press("Escape");
      await expect(account).toBeHidden();

      // Each width exercises registration with a fresh mock account.
      await logOut(page);
    });
  }
});

test("note fields stay on screen on a phone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Phone-only check");
  await page.setViewportSize(phoneSizes[0]);
  await openRegistration(page);
  await register(page);
  await saveCourse(await openCourseForm(page));
  await createNote(page);
  for (const size of phoneSizes) {
    await page.setViewportSize(size);
    await checkMetadata(page, 16);
    await page.reload();
    await expect(page.getByLabel("Note title", { exact: true })).toHaveValue(noteTitle);
    await checkMetadata(page, 16);
  }
});

test("desktop Details fields fit on one row", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Desktop-only check");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRegistration(page);
  await register(page);
  await saveCourse(await openCourseForm(page));
  await createNote(page);
  // Proposed #254 baseline, pending confirmation on Scrumboard #164.
  for (const width of [1440, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const { panel, layouts } = await checkMetadata(page, 14);
    const bounds = (await panel.boundingBox())!;
    const [course, date, category] = layouts;
    for (const field of layouts) {
      expect(field.left, field.name).toBeGreaterThanOrEqual(bounds.x - 1);
      expect(field.right, field.name).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      expect(field.top, field.name).toBeGreaterThanOrEqual(bounds.y - 1);
      expect(field.bottom, field.name).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
      if (width === 1440) {
        expect(Math.abs(field.top - course.top), field.name).toBeLessThanOrEqual(1);
      }
    }
    for (const [first, second] of [[course, date], [course, category], [date, category]]) {
      // The tablet may wrap, but the desktop row must stay in reading order.
      if (width === 768 && first.bottom <= second.top) continue;
      expect(first.right, `${first.name} before ${second.name}`).toBeLessThanOrEqual(second.left);
    }
  }
});
