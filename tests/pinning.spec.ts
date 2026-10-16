import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  // Use existing persisted notes with deterministic dates to verify normal ordering.
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("notely-data-v1")!);
    data.notes = data.notes.slice(0, 4).map((note: object, i: number) => ({
      ...note,
      id: `pin-${i}`,
      title: ["Note A", "Note B", "Note C", "Test Note A"][i],
      pinned: false,
      createdAt: `2026-01-0${i + 1}T12:00:00.000Z`,
      updatedAt: `2026-02-0${i + 1}T12:00:00.000Z`,
    }));
    localStorage.setItem("notely-data-v1", JSON.stringify(data));
  });
});

async function noOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth,
  )).toBe(true);
}

test("A: existing note exposes a visible pin/unpin state", async ({ page }) => {
  await page.goto("/notes/pin-1");
  const pin = page.getByRole("button", { name: "Pin note", exact: true });
  await expect(pin).toBeVisible();
  await expect(pin).toHaveAttribute("aria-pressed", "false");
  await pin.click();
  const unpin = page.getByRole("button", { name: "Unpin note", exact: true });
  await expect(unpin).toHaveText("Unpin");
  await expect(unpin).toHaveAttribute("aria-pressed", "true");
  await unpin.click();
  await expect(pin).toHaveText("Pin");
  await expect(pin).toHaveAttribute("aria-pressed", "false");
});

test("B: Test Note A stays pinned after an immediate reload and reopening", async ({ page }) => {
  await page.goto("/notes/pin-3");
  await expect(page.getByLabel("Note title")).toHaveValue("Test Note A");
  await page.getByRole("button", { name: "Pin note", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Unpin note" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "All notes", exact: true }).click();
  await expect(page.locator('a[href="/notes/pin-3"]').getByText("Pinned", { exact: true })).toBeVisible();
  await page.getByRole("heading", { name: "Test Note A", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unpin note" })).toBeVisible();
});

for (const sort of ["modified", "created", "title"]) {
  for (const view of ["grid", "list"]) {
    test(`C/D: pin then unpin restores ${sort} order in ${view} view`, async ({ page }) => {
      const url = `/notes?sort=${sort}&view=${view}`;
      await page.goto(url);
      const titles = page.locator('a[href^="/notes/pin-"] h3');
      const normal = sort === "title"
        ? ["Note A", "Note B", "Note C", "Test Note A"]
        : ["Test Note A", "Note C", "Note B", "Note A"];
      await expect(titles).toHaveText(normal);
      await page.getByRole("heading", { name: "Note B", exact: true }).click();
      await page.getByRole("button", { name: "Pin note", exact: true }).click();
      await page.getByRole("link", { name: "All notes", exact: true }).click();
      await page.goto(url);
      await expect(titles).toHaveText(["Note B", ...normal.filter((n) => n !== "Note B")]);
      await expect(page.locator('a[href="/notes/pin-1"]').getByText("Pinned", { exact: true })).toBeVisible();
      await noOverflow(page);
      await page.getByRole("heading", { name: "Note B", exact: true }).click();
      await page.getByRole("button", { name: "Unpin note", exact: true }).click();
      await page.getByRole("link", { name: "All notes", exact: true }).click();
      await page.goto(url);
      await expect(titles).toHaveText(normal);
      await expect(page.getByText("Pinned", { exact: true })).toHaveCount(0);
      await page.reload();
      await expect(titles).toHaveText(normal);
    });
  }
}

test("E: pin control and both note views fit narrow mobile screens", async ({ page }) => {
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/notes/pin-1");
    const pin = page.getByRole("button", { name: "Pin note", exact: true });
    await expect(pin).toBeInViewport();
    const bounds = await pin.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await noOverflow(page);
    await pin.click();
    await expect(page.getByRole("button", { name: "Unpin note" })).toBeInViewport();
    await noOverflow(page);
    await page.getByRole("link", { name: "All notes", exact: true }).click();
    for (const view of ["List view", "Grid view"]) {
      await page.getByRole("button", { name: view }).click();
      await expect(page.locator('a[href^="/notes/pin-"] h3').first()).toHaveText("Note B");
      await expect(page.locator('a[href="/notes/pin-1"]').getByText("Pinned", { exact: true })).toBeVisible();
      await noOverflow(page);
    }
    await page.getByRole("heading", { name: "Note B", exact: true }).click();
    await page.getByRole("button", { name: "Unpin note" }).click();
  }
});

test("pinning preserves pending edits for explicit Save before leaving", async ({ page }) => {
  await page.goto("/notes/pin-1");
  await page.getByLabel("Note body").fill("An edit made just before pinning.");
  await page.getByRole("button", { name: "Pin note", exact: true }).click();
  await expect(page.getByLabel("Note body")).toHaveValue("An edit made just before pinning.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "All notes", exact: true }).click();
  await page.getByRole("heading", { name: "Note B", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Note body")).toHaveValue("An edit made just before pinning.");
  await expect(page.getByRole("button", { name: "Unpin note" })).toHaveAttribute("aria-pressed", "true");
});

test("failed pin writes show an error without a false pinned indication", async ({ page }) => {
  await page.goto("/notes/pin-1");
  await expect(page.getByLabel("Note title")).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new Error("quota"); };
  });
  await page.getByRole("button", { name: "Pin note", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Changes could not be saved");
  await expect(page.getByRole("button", { name: "Pin note", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(page.getByRole("button", { name: "Pin note", exact: true })).toHaveAttribute("aria-pressed", "false");
});
