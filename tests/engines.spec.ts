import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("main screens work across themes, sizes, and engines", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  for (const theme of ["Light", "Dark"]) {
    await page.goto("/settings");
    await page.getByRole("button", { name: theme, exact: true }).click();
    for (const route of ["/", "/notes", "/schedule", "/notes/note-1"]) {
      await page.goto(route);
      for (const width of [375, 1440]) {
        await page.setViewportSize({ width, height: 950 });
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true);
      }
    }
    const a = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      a.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(errors).toEqual([]);
});
