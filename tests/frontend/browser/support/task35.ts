import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect } from "./account-fixture";
import { openNew } from "./shell";

export async function register(page: Page) {
  const email = `task35-${randomUUID()}@example.edu`;
  await page.goto("/");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("Your name").fill("Jamie");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Sample meadow password 42!");
  await page.getByLabel("Confirm password").fill("Sample meadow password 42!");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Good .*Jamie/ })).toBeVisible();
  return email;
}

export async function createCourse(page: Page, code = "CSE 442", name = "Software Engineering"): Promise<string> {
  await openNew(page, "Course");
  const dialog = page.getByRole("dialog", { name: "Add course" });
  await dialog.getByLabel("Course code").fill(code);
  await dialog.getByLabel("Course name").fill(name);
  await dialog.getByLabel("Term").fill("Fall 2026");
  const [response] = await Promise.all([
    page.waitForResponse(r => new URL(r.url()).searchParams.get("route") === "course-save"),
    dialog.getByRole("button", { name: "Add course", exact: true }).click(),
  ]);
  expect(response.ok()).toBe(true);
  const { course } = await response.json();
  expect(course).toMatchObject({ code, name, id: expect.any(String) });
  await expect(dialog).toBeHidden();
  return course.id;
}
