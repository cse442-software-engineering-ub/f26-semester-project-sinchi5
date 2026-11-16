// Usage: node scripts/run-test-page.mjs <url> — opens a test page headlessly, prints its rows and result line.
// Exits 0 only when every case passed.
import { chromium } from "@playwright/test";

const url = process.argv[2];
if (!url) { console.error("Usage: node scripts/run-test-page.mjs <url>"); process.exit(2); }
const browser = await chromium.launch();
let code = 1;
try {
  const page = await browser.newPage();
  await page.goto(url);
  try {
    await page.waitForSelector("#result[data-done]", { timeout: 120_000 });
  } catch {
    console.error("No result line appeared within 120 s. Page text:\n" + (await page.innerText("body")));
    process.exit(1);
  }
  console.log(await page.innerText("#report"));
  const { passed, total } = await page.$eval("#result", (e) => ({ passed: +e.dataset.passed, total: +e.dataset.total }));
  code = total > 0 && passed === total ? 0 : 1;
} finally {
  await browser.close();
}
process.exit(code);
