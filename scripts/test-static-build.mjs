// Check a hash-routing build behind a plain static server with no SPA fallback.
// Build first with VITE_ROUTER_MODE=hash and the same BASE_PATH used here.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium, devices, expect } from "@playwright/test";

const base = process.env.BASE_PATH || "/CSE442/2026-Fall/cse-442c/";
assert(base.startsWith("/") && base.endsWith("/"), "BASE_PATH must begin and end with /.");
const root = resolve("dist");
const mime = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (!pathname.startsWith(base)) throw new Error("Outside mount point");
    const relative = pathname.slice(base.length) || "index.html";
    const file = resolve(root, relative);
    // PHP is mocked in the browser; never serve backend source from this test server.
    if (!file.startsWith(root + sep) || !mime[extname(file)]) throw new Error("Not a static asset");
    const content = await readFile(file);
    response.writeHead(200, { "Content-Type": mime[extname(file)] });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
await new Promise((done, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", done);
});
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const missing = await fetch(origin + base + "welcome");
  assert.equal(missing.status, 404, "The test host must not rewrite nested routes.");
  await missing.text();
  browser = await chromium.launch();
  for (const [label, options] of [
    ["desktop", { viewport: { width: 1365, height: 900 } }],
    ["mobile", devices["iPhone 13"]],
  ]) {
    const context = await browser.newContext(options);
    try {
      let signedIn = false;
      let apiRequests = 0;
      const apiPaths = new Set();
      await context.route("**/api/index.php?route=*", async route => {
        const url = new URL(route.request().url());
        apiPaths.add(url.pathname);
        apiRequests++;
        const action = url.searchParams.get("route");
        if (action === "login") signedIn = true;
        await route.fulfill({ json: {
          user: signedIn ? { id: "42", name: "Route Tester", email: "routes@example.edu" } : null,
          onboarding: { completed: signedIn, step: signedIn ? 3 : 0 },
          csrfToken: "routing-fixture",
        } });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      const first = await page.goto(origin + base);
      assert.equal(first.status(), 200);
      await expect(page.getByRole("heading", { name: "Welcome to your space." })).toBeVisible();
      assert.equal(new URL(page.url()).hash, "#/welcome");
      assert.equal((await page.reload()).status(), 200);
      await expect(page.getByRole("heading", { name: "Welcome to your space." })).toBeVisible();

      await page.getByRole("button", { name: "I already have an account" }).click();
      await page.getByLabel("Email address").fill("routes@example.edu");
      await page.getByLabel("Password", { exact: true }).fill("Routing fixture password 42!");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("heading", { name: /Good .*Route/ })).toBeVisible();
      assert.equal(new URL(page.url()).pathname, base);

      // A new tab exercises an actual document request; hash-only navigation does not.
      const settings = await context.newPage();
      settings.setDefaultTimeout(20_000);
      assert.equal((await settings.goto(origin + base + "#/settings")).status(), 200);
      await expect(settings.getByRole("heading", { name: "Your space, your way", exact: true })).toBeVisible();
      assert.equal((await settings.reload()).status(), 200);
      await expect(settings.getByRole("button", { name: "Edit account", exact: true })).toBeVisible();
      assert.equal(new URL(settings.url()).hash, "#/settings");
      await settings.getByRole("link", { name: "Skip to content" }).focus();
      await settings.keyboard.press("Enter");
      await expect(settings.locator("main")).toBeFocused();
      assert.equal(new URL(settings.url()).hash, "#/settings", "Skip link must preserve the current page.");
      assert(apiRequests >= 4, "Reloads and sign-in must use the account API.");
      assert.deepEqual([...apiPaths], [base + "api/index.php"]);
      console.log(`PASS: ${label} subdirectory reloads, sign-in/API paths, and skip link without rewrites`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
