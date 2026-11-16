// Puts the test pages into dist/tests/ and writes dist/tests/pages.json + build.json from the files it finds.
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

await mkdir("dist/tests", { recursive: true });
await cp("tests/index.html", "dist/tests/index.html");
await cp("tests/shared", "dist/tests/shared", { recursive: true });
await cp("tests/backend/pages", "dist/tests/backend/pages", { recursive: true });

// The link text is the page's <title>, which starts with the card number: "<card#> <page title>".
async function list(dir) {
  const files = await readdir(`dist/tests/${dir}`).catch(() => []);
  const pages = [];
  for (const f of files.filter((n) => n.endsWith(".html"))) {
    const html = await readFile(`dist/tests/${dir}/${f}`, "utf8");
    pages.push({ href: `${dir}/${f}`, title: html.match(/<title>([^<]*)<\/title>/i)?.[1].trim() || f });
  }
  return pages.sort((a, b) => a.title.localeCompare(b.title, "en", { numeric: true }));
}

// FRONTEND HOOK: Vite (WP-03) builds tests/frontend/pages/*.html into dist/tests/frontend/pages/ before this
// step runs, so they are listed here automatically. Nothing to edit when a frontend page is added.
const pages = { backend: await list("backend/pages"), frontend: await list("frontend/pages") };
await writeFile("dist/tests/pages.json", JSON.stringify(pages, null, 2));

let commit = "";
try { commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* no git: the page shows "Build: unknown" */ }
await writeFile("dist/tests/build.json", JSON.stringify({ commit }));
