// Shared steps for the syllabus upload specs (cards 45-48), run against the mocked API in
// account-fixture.ts, so no server or API credits are needed.
import { expect, type Page } from "@playwright/test";

// The acceptance tests' cse442-syllabus.txt.
export const SYLLABUS = [
  "CSE 442 Software Engineering - Fall 2026 Syllabus",
  "Homework 1 due September 28, 2026",
  "Midterm exam October 14, 2026 at 10:00 AM",
  "Final project due December 4, 2026",
].join("\n");
export const textFile = (name: string, text: string) => ({ name, mimeType: "text/plain", buffer: Buffer.from(text) });
// A real one-page PDF with one line of text per entry, so pdf.js reads it in the browser.
export function pdfFile(name: string, lines: string[]) {
  const text = lines.map((line, i) => `${i ? "0 -20 Td " : ""}(${line.replace(/[()\\]/g, "\\$&")}) Tj`).join(" ");
  const stream = `BT /F1 12 Tf 72 720 Td ${text} ET`;
  const pdf = "%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj\n"
    + "3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>> endobj\n"
    + "4 0 obj <</Type/Font/Subtype/Type1/BaseFont/Helvetica>> endobj\n"
    + `5 0 obj <</Length ${stream.length}>> stream\n${stream}\nendstream endobj\ntrailer <</Root 1 0 R>>\n%%EOF\n`;
  return { name, mimeType: "application/pdf", buffer: Buffer.from(pdf, "latin1") };
}
// A 1x1 PNG: a photo has no text, so only the automatic reader can read it.
export const photoFile = (name: string) => ({ name, mimeType: "image/png", buffer: Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") });

export async function signUpWithCourse(page: Page, email = "notely-syllabus-442@example.edu") {
  await page.goto("/");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await page.getByLabel("Your name").fill("Task Tester");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Sample river password 42!");
  await page.getByLabel("Confirm password", { exact: true }).fill("Sample river password 42!");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByLabel("I saved my recovery code").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Add a course" }).click();
  await page.getByLabel("Course code").fill("CSE 442");
  await page.getByLabel("Term").fill("Fall 2026");
  await page.getByLabel("Course name").fill("Software Engineering");
  await page.getByRole("button", { name: "Add course" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "I’ll do this later" }).click();
  await page.getByRole("button", { name: "Let’s begin" }).click();
}

export async function openUpload(page: Page) {
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: "Upload syllabus", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Your semester, sorted" })).toBeVisible();
  return page.getByRole("dialog");
}

// Uploads a text syllabus and waits for the review screen.
export async function reviewSyllabus(page: Page, text = SYLLABUS) {
  const dialog = await openUpload(page);
  await dialog.getByLabel("Choose upload file").setInputFiles(textFile("cse442-syllabus.txt", text));
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Add to schedule" })).toBeVisible();
  return dialog;
}
