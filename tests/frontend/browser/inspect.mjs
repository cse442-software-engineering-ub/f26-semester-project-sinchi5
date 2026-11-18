import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const browser = await chromium.launch({ timeout: 30000 });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1040 },
});
const page = await context.newPage();
page.on("pageerror", (e) => console.error("PAGE ERROR", e.message));
await page.goto("http://127.0.0.1:5173");
await page.getByRole("button", { name: "Take a look around first" }).click();
await page
  .getByRole("heading", { name: /Good (morning|afternoon|evening)/ })
  .waitFor();
await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
const a = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
  .analyze();
console.log(
  JSON.stringify(
    a.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
    null,
    2,
  ),
);
await page.setViewportSize({ width: 375, height: 812 });
await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
await page.goto("http://127.0.0.1:5173/notes");
await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
console.log(
  "OVERFLOW",
  await page.evaluate(() =>
    Array.from(document.querySelectorAll("body *"))
      .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
      .map((e) => ({
        tag: e.tagName,
        cls: e.className,
        right: e.getBoundingClientRect().right,
      }))
      .slice(0, 20),
  ),
);
await page.screenshot({ path: "test-results/zoom.png", fullPage: true });
await browser.close();
