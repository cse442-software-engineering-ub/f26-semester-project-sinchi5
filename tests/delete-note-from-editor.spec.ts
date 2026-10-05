import { test, expect, type Page } from "@playwright/test";

// Card 119 mocks the notes repository by wrapping the real one as the Vite dev
// server serves it: every call is recorded, delete can be made to reject, and
// the collaborator list can be replaced.
type Spy = {
  noteCalls: string[];
  failDelete?: boolean;
  collaborators?: { id: string; name: string; email: string; status: string; permission: string }[];
};

async function spyOnNotes(page: Page) {
  await page.route(/\/src\/services\/app-repositories\.ts/, async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const body = original.replace("export function createAppRepositories", "function createRealRepositories") + `
export function createAppRepositories(...args) {
  const repo = createRealRepositories(...args);
  const real = repo.notes;
  window.noteCalls = [];
  repo.notes = new Proxy(real, {
    get(_target, method) {
      return (...values) => {
        window.noteCalls.push(String(method));
        if (method === "delete" && window.failDelete) return Promise.reject(new Error("Mocked failure."));
        if (method === "collaborators" && window.collaborators) return Promise.resolve(structuredClone(window.collaborators));
        return real[method](...values);
      };
    },
  });
  return repo;
}`;
    await route.fulfill({ response, body });
  });
}

async function openSeededNote(page: Page, ownerId = "student") {
  await spyOnNotes(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await page.evaluate((ownerId) => {
    const data = JSON.parse(localStorage.getItem("notely-data-v1")!);
    const template = data.notes[0];
    data.notes = [
      { ...template, id: "calculus", title: "Calculus review", body: "Limits", pinned: false, ownerId, visibility: "shared" },
      { ...template, id: "keep", title: "Keep this note", body: "", pinned: false, ownerId: "student" },
    ];
    data.comments = [];
    data.versions = [];
    localStorage.setItem("notely-data-v1", JSON.stringify(data));
  }, ownerId);
  await page.goto("/notes/calculus");
  await expect(page.getByLabel("Note title")).toHaveValue("Calculus review");
}

const noteCalls = (page: Page) => page.evaluate(() => (window as unknown as Spy).noteCalls);
const confirmDelete = async (page: Page) => {
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this note?" });
  await expect(dialog).toContainText("“Calculus review”");
  await dialog.getByRole("button", { name: "Delete note", exact: true }).click();
  return dialog;
};

test("Test 1 - deleting from the editor returns to the notes list", async ({ page }) => {
  await openSeededNote(page);
  await expect(page.getByRole("button", { name: "Delete note", exact: true })).toBeVisible();
  await confirmDelete(page);
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByRole("status").filter({ hasText: "Note deleted." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keep this note", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Calculus review", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Keep this note", exact: true })).toBeVisible();
  await expect(page.getByText("Note deleted.")).toHaveCount(0);
});

test("Test 2 - a pending autosave never runs after the delete", async ({ page }) => {
  await page.clock.install();
  await openSeededNote(page);
  await page.getByLabel("Note title").fill("Calculus review v2");
  // Metadata autosaves after 600 ms. Pausing the clock keeps that save
  // pending until after the delete, however long the dialog takes.
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption("Work");
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50);
  await confirmDelete(page);
  await expect(page).toHaveURL(/\/notes$/);
  await page.clock.runFor(2000);
  const calls = await noteCalls(page);
  expect(calls).toContain("delete");
  expect(calls.slice(calls.indexOf("delete"))).not.toContain("save");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("This note could not be found.")).toHaveCount(0);
  await expect(page.getByText("Not saved")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^Calculus review/ })).toHaveCount(0);
  const stored = await page.evaluate(() => localStorage.getItem("notely-data-v1")!);
  expect(stored).not.toContain("Calculus review");
});

test("Test 3 - Cancel or a failed delete keeps the editor and unsaved changes", async ({ page }) => {
  await openSeededNote(page);
  await page.getByLabel("Note body").fill("Draft paragraph");
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Delete this note?" });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/notes\/calculus$/);
  await expect(page.getByLabel("Note body")).toHaveValue("Draft paragraph");

  await page.evaluate(() => { (window as unknown as Spy).failDelete = true; });
  dialog = await confirmDelete(page);
  await expect(dialog.getByRole("alert")).toContainText("This note could not be deleted.");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/calculus$/);
  await expect(page.getByLabel("Note body")).toHaveValue("Draft paragraph");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Note body")).toHaveValue("Draft paragraph");
});

for (const permission of ["edit", "view"]) {
  test(`Test 4 - no Delete note button for a ${permission} collaborator`, async ({ page }) => {
    await page.addInitScript((permission) => {
      (window as unknown as Spy).collaborators = [
        { id: "demo", name: "Erin", email: "demo@example.edu", status: "Accepted", permission },
      ];
    }, permission);
    await openSeededNote(page, "another-student");
    await expect(page.getByLabel("Note title")).toBeEditable({ editable: permission === "edit" });
    await expect(page.getByRole("button", { name: "Delete note", exact: true })).toHaveCount(0);
  });
}
