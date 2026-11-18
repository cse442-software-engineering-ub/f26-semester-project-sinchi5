// Card 222: every color lives in tokens.css, so a scheme change recolors everything.
import { expect, it } from "vitest";
// @ts-ignore the project has no Node types; vitest runs this file in Node
import { readdirSync, readFileSync, statSync } from "node:fs";

const stylesheets = (dir: string): string[] =>
  readdirSync(dir).flatMap((name: string) => {
    const path = `${dir}/${name}`;
    return statSync(path).isDirectory() ? stylesheets(path) : path.endsWith(".css") ? [path] : [];
  });

it("no stylesheet under src other than tokens.css contains a hex color", () => {
  const checked = stylesheets("src").filter((path) => !path.endsWith("tokens.css"));
  expect(checked.length).toBeGreaterThan(10); // the walk really found the stylesheets
  const offenders = checked.flatMap((path) =>
    (readFileSync(path, "utf8") as string).replace(/\/\*[\s\S]*?\*\//g, "").split("\n")
      .flatMap((line, i) => (/#[0-9a-fA-F]{3,8}\b/.test(line) ? [`${path}:${i + 1}: ${line.trim()}`] : [])),
  );
  expect(offenders).toEqual([]);
});
