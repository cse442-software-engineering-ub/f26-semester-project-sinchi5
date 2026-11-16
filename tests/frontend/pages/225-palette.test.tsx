// Processing test: calls buildPalette directly. No screen is mounted and no request is made.
import tokensCss from "../../../src/app/tokens.css?raw";
import { page, test, expect } from "../../shared/runner.js";
import { buildPalette, contrastRatio, PALETTE_VARIABLES } from "../../../src/services/palette";

page({ card: "225", title: "Processing: Build a readable palette from three colors", kind: "frontend" });

const FILE = "src/services/palette.ts → buildPalette";
const comfy = { accent: "#8b5d33", background: "#f8f9f6", text: "#304c58" };
const PAIRS = [["--text", "--bg"], ["--text", "--surface"], ["--muted", "--bg"], ["--primary-text", "--primary"]] as const;
type Mode = Record<string, string>;
// The worst of the four pairs in both modes, as [ratio, which].
function worst(p: { light: Mode; dark: Mode }): [number, string] {
  let low: [number, string] = [Infinity, ""];
  for (const [name, mode] of [["light", p.light], ["dark", p.dark]] as const)
    for (const [fg, bg] of PAIRS) {
      const r = contrastRatio(mode[fg], mode[bg]);
      if (r < low[0]) low = [r, `${name} ${fg} on ${bg}`];
    }
  return low;
}
const readable = (t: Parameters<typeof buildPalette>[0]) => worst(buildPalette(t))[0] >= 4.5;

await test("1. A color variable from tokens.css is missing in the light or the dark set", FILE, () => {
  const names = [...new Set([...tokensCss.matchAll(/^\s*(--[a-z-]+):/gm)].map((m) => m[1]))].sort();
  const p = buildPalette(comfy);
  expect(Object.keys(p.light).sort()).toEqual(names);
  expect(Object.keys(p.dark).sort()).toEqual(names);
  expect([...PALETTE_VARIABLES].sort()).toEqual(names);
});
await test("2. White text on a white background is left unreadable, or not flagged", FILE, () => {
  const p = buildPalette({ accent: "#8b5d33", background: "#ffffff", text: "#ffffff" });
  expect(p.adjusted).toBe(true);
  expect(worst(p)[0] >= 4.5).toBe(true);
});
await test("3. A black background gives unreadable text in either mode", FILE, () => {
  const p = buildPalette({ accent: "#3366cc", background: "#000000", text: "#000000" });
  expect(p.dark["--bg"]).toBe("#000000");
  expect(p.adjusted).toBe(true);
  expect(worst(p)[0] >= 4.5).toBe(true);
});
await test("4. A mid-gray accent gets button text that cannot be read", FILE, () => {
  for (const gray of ["#777777", "#808080", "#8c8c8c"]) {
    const p = buildPalette({ ...comfy, accent: gray });
    for (const mode of [p.light, p.dark]) expect(contrastRatio(mode["--primary-text"], mode["--primary"]) >= 4.5).toBe(true);
  }
});

// 5 accents x 4 backgrounds x 4 texts = 80 triples, including the awkward ones (white, black, mid-gray, saturated).
const grid = ["#8b5d33", "#ffffff", "#808080", "#00ff00", "#4a1d96"].flatMap((accent) =>
  ["#f8f9f6", "#000000", "#777777", "#ffcc00"].flatMap((background) =>
    ["#304c58", "#ffffff", "#000000", "#ff0000"].map((text) => ({ accent, background, text }))));
await test("5. One of 80 input triples leaves a text pair below 4.5:1 (text, muted, button)", FILE, () => {
  let low: [number, string, unknown] = [Infinity, "", null];
  for (const t of grid) { const [r, which] = worst(buildPalette(t)); if (r < low[0]) low = [r, which, t]; }
  if (low[0] < 4.5) throw new Error(`worst ratio ${low[0].toFixed(2)} for ${low[1]} with ${JSON.stringify(low[2])}`);
});
await test("6. A comfortable input is flagged as adjusted", FILE, () => {
  expect(buildPalette(comfy).adjusted).toBe(false);
  expect(buildPalette({ accent: "#6a4bd8", background: "#1e1e2e", text: "#cdd6f4" }).adjusted).toBe(false);
});
await test("7. The same input twice gives a different output", FILE, () => {
  expect(buildPalette(comfy)).toEqual(buildPalette({ ...comfy }));
  expect(buildPalette({ accent: "#8B5D33", background: "#F8F9F6", text: "#304C58" })).toEqual(buildPalette(comfy));
});
await test("8. Anything but #rrggbb is accepted instead of throwing", FILE, () => {
  for (const bad of ["red", "#fff", "#12345g", "#123456;}body{display:none", "", null, 5])
    for (const key of ["accent", "background", "text"] as const) {
      let threw = false;
      try { buildPalette({ ...comfy, [key]: bad as string }); } catch { threw = true; }
      expect(threw).toBe(true);
    }
});
await test("9. A value that is not a valid color is produced", FILE, () => {
  for (const t of [comfy, { accent: "#00ff00", background: "#000000", text: "#ffffff" }, { accent: "#ffffff", background: "#ffffff", text: "#ffffff" }]) {
    const p = buildPalette(t);
    for (const mode of [p.light, p.dark])
      for (const [name, value] of Object.entries(mode)) {
        const ok = name === "--shadow" ? /^0 16px 64px #[0-9a-f]{8}$/.test(value) : /^#[0-9a-f]{6}$/.test(value);
        if (!ok) throw new Error(`${name} is ${JSON.stringify(value)}`);
      }
  }
});
await test("10. A dark background is not used as the dark set, or a light one as the light set", FILE, () => {
  const dark = buildPalette({ accent: "#88c0d0", background: "#2e3440", text: "#eceff4" });
  expect(dark.dark["--bg"]).toBe("#2e3440");
  expect(dark.light["--bg"] === "#2e3440").toBe(false);
  expect(readable({ accent: "#88c0d0", background: "#2e3440", text: "#eceff4" })).toBe(true);
  const light = buildPalette(comfy);
  expect(light.light["--bg"]).toBe("#f8f9f6");
  expect(light.dark["--bg"] === "#f8f9f6").toBe(false);
});
await test("11. The accent is changed in the mode it was chosen for, or the other mode copies it", FILE, () => {
  const p = buildPalette(comfy);
  expect(p.light["--primary"]).toBe("#8b5d33");
  expect(p.dark["--primary"] === p.light["--primary"]).toBe(false);
});
await test("12. A fully saturated accent on a mid-gray page is unreadable", FILE, () => {
  expect(readable({ accent: "#ff00ff", background: "#777777", text: "#777777" })).toBe(true);
});
