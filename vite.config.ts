import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readdirSync } from "node:fs";
// Every tests/frontend/pages/*.html is an extra build input, so adding a test page edits no shared file.
const pagesDir = "tests/frontend/pages";
const testPages = existsSync(pagesDir)
  ? Object.fromEntries(readdirSync(pagesDir).filter((f) => f.endsWith(".html")).map((f) => [`test-${f.slice(0, -5)}`, `${pagesDir}/${f}`]))
  : {};
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || "/",
  build: { rollupOptions: { input: { main: "index.html", ...testPages } } },
  server: { proxy: { "/api": { target: "http://127.0.0.1:8080" } } },
});
