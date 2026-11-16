import { describe, expect, it } from "vitest";
import { buildPalette, contrastRatio, PALETTE_VARIABLES } from "./palette";

const accents = ["#8b5d33", "#ffffff", "#000000", "#808080", "#ff00ff", "#00ff00"];
const backgrounds = ["#f8f9f6", "#ffffff", "#000000", "#777777", "#2b2b2b", "#ffcc00"];
const texts = ["#304c58", "#ffffff", "#000000", "#777777", "#ff0000"];
const triples = accents.flatMap((accent) => backgrounds.flatMap((background) => texts.map((text) => ({ accent, background, text }))));
const pairs = [["--text", "--bg"], ["--text", "--surface"], ["--muted", "--bg"], ["--primary-text", "--primary"]] as const;

describe("buildPalette", () => {
  // Vitest stubs CSS imports, so the check against tokens.css itself lives on test page 225.
  it("defines every color variable in both modes", () => {
    const names = [...PALETTE_VARIABLES].sort();
    const p = buildPalette({ accent: "#8b5d33", background: "#f8f9f6", text: "#304c58" });
    for (const mode of [p.light, p.dark]) expect(Object.keys(mode).sort()).toEqual(names);
  });

  it("holds the four contrast pairs in both modes over 180 input triples", () => {
    expect(triples.length).toBeGreaterThanOrEqual(60);
    for (const t of triples) {
      const p = buildPalette(t);
      for (const mode of [p.light, p.dark]) for (const [fg, bg] of pairs) expect(contrastRatio(mode[fg], mode[bg]), JSON.stringify([t, fg, bg])).toBeGreaterThanOrEqual(4.5);
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
      expect(value, name).toMatch(name === "--shadow" ? /^0 16px 64px #[0-9a-f]{8}$/ : /^#[0-9a-f]{6}$/);
    }
  });

  it("throws on anything that is not #rrggbb", () => {
    const ok = { accent: "#8b5d33", background: "#f8f9f6", text: "#304c58" };
    for (const bad of ["red", "#fff", "#12345g", "#1234567", "#123456;}", "", null, 5]) {
      for (const key of ["accent", "background", "text"] as const) expect(() => buildPalette({ ...ok, [key]: bad as string })).toThrow();
    }
  });
});
