// Card 225: three colors in, a full readable palette out (light and dark), no dependency.
// Colors are mixed in OKLCH/OKLab; text pairs are nudged in lightness until they reach 4.5:1.
export type PaletteInput = { accent: string; background: string; text: string };
export type Palette = Record<(typeof PALETTE_VARIABLES)[number], string>;
export type BuiltPalette = { light: Palette; dark: Palette; adjusted: boolean };

// Same names as the color variables in src/app/tokens.css.
export const PALETTE_VARIABLES = [
  "--bg", "--surface", "--surface-soft", "--text", "--muted", "--line",
  "--primary", "--primary-text", "--sage", "--mint", "--nav", "--shadow",
] as const;

const MIN_RATIO = 4.5;
type Lch = [number, number, number]; // lightness 0-1, chroma, hue in degrees

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbOf(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function toLab(hex: string): [number, number, number] {
  const [r, g, b] = rgbOf(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function labRgb(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const hexOfRgb = (rgb: number[]) =>
  "#" + rgb.map((c) => Math.round(clamp(fromLinear(clamp(c))) * 255).toString(16).padStart(2, "0")).join("");

function toLch(hex: string): Lch {
  const [L, a, b] = toLab(hex);
  return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180) / Math.PI];
}

// Shrinks chroma until the color fits in sRGB, so lightness and hue stay put.
function fromLch(L: number, C: number, h: number): string {
  L = clamp(L);
  for (let k = 0; k < 40; k++, C *= 0.9) {
    const rgb = labRgb(L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180));
    if (rgb.every((c) => c > -0.0005 && c < 1.0005)) return hexOfRgb(rgb);
  }
  return hexOfRgb(labRgb(L, 0, 0));
}

function mix(from: string, to: string, t: number): string {
  const [L1, a1, b1] = toLab(from), [L2, a2, b2] = toLab(to);
  return hexOfRgb(labRgb(L1 + (L2 - L1) * t, a1 + (a2 - a1) * t, b1 + (b2 - b1) * t));
}

function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const passes = (fg: string, bgs: string[]) => bgs.every((bg) => contrastRatio(fg, bg) >= MIN_RATIO);

// Moves lightness (away from the backgrounds first) in 0.01 steps until every pair reaches 4.5:1; null if impossible.
function nudge(fg: string, bgs: string[]): string | null {
  if (passes(fg, bgs)) return fg;
  const [L, C, h] = toLch(fg);
  const lum = bgs.reduce((sum, bg) => sum + luminance(bg), 0) / bgs.length;
  for (const dir of lum > 0.18 ? [-1, 1] : [1, -1]) {
    for (let i = 1; i <= 100; i++) {
      const next = fromLch(L + dir * 0.01 * i, C, h);
      if (passes(next, bgs)) return next;
    }
  }
  return null;
}

function buildMode(dark: boolean, given: boolean, input: PaletteInput): { set: Palette; adjusted: boolean } {
  const [aL, aC, aH] = toLch(input.accent);
  const [, bC, bH] = toLch(input.background);
  const [, tC, tH] = toLch(input.text);
  const bg = given ? input.background : fromLch(dark ? 0.21 : 0.975, Math.min(bC, dark ? 0.03 : 0.02), bH);
  const bgL = toLch(bg)[0];
  const tint = (dL: number, c = Math.min(bC, 0.04)) => fromLch(bgL + dL, c, bH);
  let surface = tint(dark ? 0.035 : 0.025);
  const soft = tint(dark ? 0.07 : -0.03);
  const textStart = given ? input.text : fromLch(dark ? 0.93 : 0.3, Math.min(tC, 0.05), tH);
  let text = nudge(textStart, [bg, surface]);
  if (!text) {
    surface = bg; // no text color reaches 4.5:1 on both, so the card color becomes the page color
    text = nudge(textStart, [bg]) ?? (contrastRatio("#ffffff", bg) > contrastRatio("#000000", bg) ? "#ffffff" : "#000000");
  }
  const adjusted = given && text !== input.text;
  const muted = nudge(mix(text, bg, 0.3), [bg, surface]) ?? nudge(mix(text, bg, 0.3), [bg]) ?? text;
  const primary = given ? input.accent : fromLch(dark ? Math.max(aL, 0.78) : Math.min(aL, 0.5), aC, aH);
  const ink = fromLch(0.2, Math.min(aC, 0.03), aH);
  const primaryText = ["#ffffff", ink, "#000000"].find((c) => contrastRatio(c, primary) >= MIN_RATIO)
    ?? (contrastRatio("#ffffff", primary) > contrastRatio("#000000", primary) ? "#ffffff" : "#000000");
  const set: Palette = {
    "--bg": bg,
    "--surface": surface,
    "--surface-soft": soft,
    "--text": text,
    "--muted": muted,
    "--line": mix(bg, text, dark ? 0.2 : 0.14),
    "--primary": primary,
    "--primary-text": primaryText,
    "--sage": fromLch(bgL + (dark ? 0.09 : -0.045), Math.min(aC * 0.3, 0.04), aH), // takes the accent's hue
    "--mint": fromLch(dark ? 0.82 : 0.8, Math.min(aC * 0.5, 0.07), aH),
    "--nav": tint(dark ? 0.05 : -0.02, Math.min(bC, 0.04)),
    "--shadow": dark ? "0 16px 64px #00000066" : `0 16px 64px ${text}20`,
  };
  return { set, adjusted };
}

// Throws on anything but #rrggbb. Same input, same output.
export function buildPalette(input: PaletteInput): BuiltPalette {
  const clean = {} as PaletteInput;
  for (const key of ["accent", "background", "text"] as const) {
    const value = input?.[key];
    if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
      throw new Error(`${key} must be a color like #1a2b3c`);
    }
    clean[key] = value.toLowerCase();
  }
  const givenDark = luminance(clean.background) < 0.18;
  const given = buildMode(givenDark, true, clean);
  const other = buildMode(!givenDark, false, clean);
  return { light: givenDark ? other.set : given.set, dark: givenDark ? given.set : other.set, adjusted: given.adjusted };
}
