import { describe, expect, it } from "vitest";
// @ts-ignore the project has no Node types; vitest runs this file in Node
import { readFileSync } from "node:fs";
import { buildPalette, contrastRatio, PALETTE_VARIABLES } from "../../../../src/services/palette";

const accents = ["#8b5d33", "#ffffff", "#000000", "#808080", "#ff00ff", "#00ff00"];
const backgrounds = ["#f8f9f6", "#ffffff", "#000000", "#777777", "#2b2b2b", "#ffcc00"];
const texts = ["#304c58", "#ffffff", "#000000", "#777777", "#ff0000"];
const triples = accents.flatMap((accent) => backgrounds.flatMap((background) => texts.map((text) => ({ accent, background, text }))));
const pairs = [["--text", "--bg"], ["--text", "--surface"], ["--muted", "--bg"], ["--primary-text", "--primary"]] as const;

describe("buildPalette", () => {
  it("defines every color variable in both modes", () => {
    const names = [...PALETTE_VARIABLES].sort();
    const p = buildPalette({ accent: "#8b5d33", background: "#f8f9f6", text: "#304c58" });
    for (const mode of [p.light, p.dark]) expect(Object.keys(mode).sort()).toEqual(names);
  });

  it("declares exactly the variables a built-in scheme declares, so nothing falls back to another scheme", () => {
    const css = readFileSync("src/app/tokens.css", "utf8") as string;
    const block = (selector: string) => {
      const body = css.split(`${selector} {`)[1].split("\n}")[0];
      return [...body.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]).sort();
    };
    const p = buildPalette({ accent: "#8b5d33", background: "#f8f9f6", text: "#304c58" });
    expect(Object.keys(p.light).sort()).toEqual(block(':root[data-scheme="fjord"]'));
    expect(Object.keys(p.dark).sort()).toEqual(block(':root[data-scheme="fjord"][data-theme="dark"]'));
  });

  it("holds the four contrast pairs in both modes over 180 input triples", () => {
    expect(triples.length).toBeGreaterThanOrEqual(60);
    for (const t of triples) {
      const p = buildPalette(t);
      for (const mode of [p.light, p.dark]) for (const [fg, bg] of pairs) expect(contrastRatio(mode[fg], mode[bg]), JSON.stringify([t, fg, bg])).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Card 251: the planner material keeps text readable on the sheet and the ground, and the ribbon visible.
  const planner = [
    ["--text", "--sheet", 4.5], ["--text", "--ground", 4.5], ["--muted", "--sheet", 4.5], ["--muted", "--ground", 4.5],
    ["--ribbon-text", "--ribbon", 4.5], ["--warn", "--warn-soft", 4.5], ["--ribbon", "--sheet", 3], ["--ribbon", "--ground", 3], ["--ribbon", "--nav", 3],
  ] as const;
  it("keeps the planner pairs readable (AA) in both modes over 180 input triples", () => {
    for (const t of triples) {
      const p = buildPalette(t);
      for (const mode of [p.light, p.dark]) for (const [fg, bg, min] of planner) expect(contrastRatio(mode[fg], mode[bg]), JSON.stringify([t, fg, bg])).toBeGreaterThanOrEqual(min);
    }
  });

  it("keeps the planner pairs readable (AA) in all eight blocks of tokens.css", () => {
    const css = readFileSync("src/app/tokens.css", "utf8") as string;
    const vars = (selector: string) => Object.fromEntries([...css.split(`${selector} {`)[1].split("\n}")[0].matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]));
    const long = (h: string) => (h.length === 4 ? "#" + [...h.slice(1)].map((c) => c + c).join("") : h);
    for (const scheme of ["", "fjord", "rose", "mocha"]) for (const dark of [false, true]) {
      const base = vars(dark ? ':root[data-theme="dark"]' : ":root");
      const own = scheme ? vars(`:root[data-scheme="${scheme}"]${dark ? '[data-theme="dark"]' : ""}`) : {};
      const v = { ...base, ...own } as Record<string, string>;
      for (const [fg, bg, min] of planner) expect(contrastRatio(long(v[fg]), long(v[bg])), `${scheme || "sage"} ${dark ? "dark" : "light"} ${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
    }
  });

  it("flags white on white and leaves a comfortable input alone", () => {
    expect(buildPalette({ accent: "#8b5d33", background: "#ffffff", text: "#ffffff" }).adjusted).toBe(true);
    expect(buildPalette({ accent: "#8b5d33", background: "#f8f9f6", text: "#304c58" }).adjusted).toBe(false);
  });

  it("is deterministic, ignores hex case, and every value is a color", () => {
    const t = { accent: "#8B5D33", background: "#F8F9F6", text: "#304C58" };
    expect(buildPalette(t)).toEqual(buildPalette({ accent: "#8b5d33", background: "#f8f9f6", text: "#304c58" }));
    const p = buildPalette(t);
    for (const [name, value] of [...Object.entries(p.light), ...Object.entries(p.dark)]) {
      expect(value, name).toMatch(name.includes("shadow") ? /^0 \d+px \d+px (\d+px )?#[0-9a-f]{6,8}(, 0 \d+px \d+px (\d+px )?#[0-9a-f]{6,8})*$/ : name === "--swatch-line" || name.startsWith("--overlay") ? /^#[0-9a-f]{4,8}$/ : /^#[0-9a-f]{6}$/);
    }
  });

  it("throws on anything that is not #rrggbb", () => {
    const ok = { accent: "#8b5d33", background: "#f8f9f6", text: "#304c58" };
    for (const bad of ["red", "#fff", "#12345g", "#1234567", "#123456;}", "", null, 5]) {
      for (const key of ["accent", "background", "text"] as const) expect(() => buildPalette({ ...ok, [key]: bad as string })).toThrow();
    }
  });
});
