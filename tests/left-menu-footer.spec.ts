import { test, expect } from "./support/account-fixture";

test("left menu footer has no initial", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Take a look around first" }).click();
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();

  const sidebar = page.locator("aside");
  const footer = sidebar.locator('[class*="sideFooter"]');
  const name = footer.locator("strong");
  const account = page.getByRole("link", { name: "Your account", exact: true });
  await expect(account).toHaveCount(1);
  await expect(account).toBeVisible();

  await account.click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  const userName = await page.locator('[class*="accountSummary"] strong').innerText();
  expect(userName.trim()).not.toBe("");
  await expect(account).toHaveText(userName[0].toUpperCase());

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    await expect(name).toBeVisible();
    await expect(name).toHaveText(userName);
    await expect(footer.getByText("Curious mind, always.", { exact: true })).toBeVisible();
    await expect(footer.locator('[class*="avatar"]')).toHaveCount(0);
    expect(await name.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const footerBounds = element.closest('[class*="sideFooter"]')!.getBoundingClientRect();
      return element.scrollWidth === element.clientWidth &&
        bounds.left >= footerBounds.left && bounds.right <= footerBounds.right;
    })).toBe(true);
  }
});
