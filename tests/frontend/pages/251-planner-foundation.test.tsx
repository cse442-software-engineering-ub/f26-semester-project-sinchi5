// Frontend test: card 251, the planner foundation (tokens, shared parts, app shell) on the real code with the API replaced.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import tokensCss from "../../../src/app/tokens.css?raw";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byLabel, click, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";
import { Sheet, Spread, WeekStrip, PageHeading, Chip } from "../../../src/shared/ui";
import s from "../../../src/shared/ui.module.css";
import { buildPalette, contrastRatio, PALETTE_VARIABLES } from "../../../src/services/palette";

page({ card: "251", title: "Frontend: A planner design foundation for every page", kind: "frontend" });

const TOKENS = "src/app/tokens.css";
const UI = "src/shared/ui.tsx";
const SHELL = "src/app/App.tsx → App, src/app/shell.module.css";
const PLANNER = ["--ground", "--sheet", "--sheet-edge", "--sheet-shadow", "--spine", "--spine-shade", "--rule", "--ribbon", "--ribbon-text", "--ribbon-notch", "--warn", "--warn-soft"];
const BLOCKS = [":root", ':root[data-theme="dark"]', ...["fjord", "rose", "mocha"].flatMap((n) => [`:root[data-scheme="${n}"]`, `:root[data-scheme="${n}"][data-theme="dark"]`])];
// Three contrasting custom themes: a very light warm one, a saturated mid one, a dark-background one.
const CUSTOM = [
  { accent: "#c2410c", background: "#fff8ec", text: "#3b2f2f" },
  { accent: "#e11d48", background: "#3fa7d6", text: "#ffffff" },
  { accent: "#f2aa4c", background: "#101820", text: "#e8e8e8" },
];
const block = (sel: string) => Object.fromEntries([...tokensCss.split(`${sel} {`)[1].split("\n}")[0].matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]));
const long = (h: string) => (h.length === 4 ? "#" + [...h.slice(1)].map((c) => c + c).join("") : h);
const rgb = (h: string) => `rgb(${[1, 3, 5].map((i) => parseInt(long(h).slice(i, i + 2), 16)).join(", ")})`;
const root = document.documentElement;
const look = (scheme: string, theme: string) => { root.dataset.scheme = scheme; root.dataset.theme = theme; const css = getComputedStyle(root); return (n: string) => long(css.getPropertyValue(n).trim()); };

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const cse442 = { id: "c1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const routes = {
  session: { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token", preferences: { mode: "light", scheme: "sage" } },
  notes: { notes: [] }, events: { events: [] }, courses: { courses: [cse442] },
  "course-notes-shares": { shares: [] }, "shared-notes": { notes: [] }, friends: { friends: [], incoming: [], outgoing: [] },
};
const app = (path: string) => <MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>;
const fullWidth = (el: HTMLElement) => { Object.assign(el.ownerDocument.body.style, { maxWidth: "none", padding: "0", margin: "0" }); return el; };
const height = (el: Element | null) => Math.round(el?.getBoundingClientRect().height ?? 0);
// Mounts a shared part (in an iframe that wide when given) and waits for React to render it.
const shown = async (ui: Parameters<typeof mount>[0], width?: number) => { const el = mount(ui, width ? { width } : {}); await waitFor(() => el.firstElementChild); return el; };
const week = (extra: Partial<Parameters<typeof WeekStrip>[0]> = {}) => (
  <WeekStrip date="2026-11-17" today="2026-11-17" marked={["2026-11-16", "2026-11-17"]} onPrev={() => {}} onNext={() => {}} onToday={() => {}} {...extra} />
);

await test("1. A planner color is missing from one of the eight scheme blocks or from a custom theme", `${TOKENS} (each block) and src/services/palette.ts → buildPalette`, () => {
  const missing = BLOCKS.flatMap((sel) => PLANNER.filter((n) => !(n in block(sel))).map((n) => `${sel} ${n}`));
  for (const t of CUSTOM) for (const mode of ["light", "dark"] as const) { const p = buildPalette(t)[mode]; missing.push(...PLANNER.filter((n) => !p[n as keyof typeof p]).map((n) => `custom ${t.background} ${mode} ${n}`)); }
  expect(missing).toEqual([]);
  expect(PLANNER.every((n) => (PALETTE_VARIABLES as readonly string[]).includes(n))).toBe(true);
});
await test("2. The spacing, type or radius scale is missing or off its steps", `${TOKENS} → :root (planner scale)`, () => {
  const css = getComputedStyle(root);
  const v = (n: string) => css.getPropertyValue(n).trim();
  expect([1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--space-${i}`))).toEqual(["4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px"]);
  expect(v("--space-gutter").startsWith("clamp(")).toBe(true);
  const sizes = ["label", "small", "body", "lead", "title", "heading", "display"];
  expect(sizes.filter((n) => !v(`--fs-${n}`) || !v(`--lh-${n}`) || !v(`--ls-${n}`))).toEqual([]);
  expect(v("--fs-display").startsWith("clamp(")).toBe(true);
  expect(v("--radius-sheet")).toBe("14px");
});
await test("3. Text, muted text, the ribbon or the due chip is under AA on the sheet or the ground (8 blocks, 3 custom themes)", `${TOKENS} and src/services/palette.ts → buildPalette (ribbon, warn)`, () => {
  const pairs = [["--text", "--sheet", 4.5], ["--text", "--ground", 4.5], ["--muted", "--sheet", 4.5], ["--muted", "--ground", 4.5], ["--ribbon-text", "--ribbon", 4.5],
    ["--primary-text", "--primary", 4.5], ["--warn", "--warn-soft", 4.5], ["--ribbon", "--sheet", 3], ["--ribbon", "--ground", 3], ["--ribbon", "--nav", 3]] as const;
  const low: string[] = [];
  const check = (name: string, get: (n: string) => string) => { for (const [fg, bg, min] of pairs) { const r = contrastRatio(get(fg), get(bg)); if (r < min) low.push(`${name} ${fg} on ${bg} ${r.toFixed(2)}`); } };
  try {
    for (const scheme of ["sage", "fjord", "rose", "mocha"]) for (const theme of ["light", "dark"]) check(`${scheme} ${theme}`, look(scheme, theme));
  } finally { delete root.dataset.scheme; delete root.dataset.theme; }
  for (const t of CUSTOM) { const p = buildPalette(t); check(`custom ${t.background} light`, (n) => p.light[n as keyof typeof p.light]); check(`custom ${t.background} dark`, (n) => p.dark[n as keyof typeof p.dark]); }
  expect(low).toEqual([]);
});
await test("4. A Spread does not sit side by side with a spine on a laptop, or does not stack on a 375 px phone", `${UI} → Sheet, Spread (ui.module.css .spread)`, async () => {
  const spread = <Spread label="Tuesday" left={<p>Hours</p>} right={<p>Notes for today</p>} />;
  let el = fullWidth(await shown(spread, 1200));
  let [a, b] = [...el.querySelectorAll("[data-page]")].map((p) => p.getBoundingClientRect());
  expect([a.top === b.top, b.left > a.right, el.querySelector("[data-spine]") !== null, el.querySelector("section")?.getAttribute("aria-label")]).toEqual([true, true, true, "Tuesday"]);
  el = fullWidth(await shown(spread, 375));
  [a, b] = [...el.querySelectorAll("[data-page]")].map((p) => p.getBoundingClientRect());
  expect([b.top >= a.bottom - 1, Math.round(a.width) === Math.round(b.width), pageScrollWidth() <= 375]).toEqual([true, true, true]);
  el = fullWidth(await shown(<Sheet label="Due">Due list</Sheet>, 375));
  expect([el.querySelector("section")?.textContent, getComputedStyle(el.querySelector("section")!).borderRadius]).toEqual(["Due list", "14px"]);
});
await test("5. The week strip does not show 7 days Sunday to Saturday, mark today, or dot the busy days", `${UI} → WeekStrip`, async () => {
  const el = await shown(week());
  const days = [...el.querySelectorAll("[data-day]")];
  expect(days.map((d) => d.getAttribute("data-day"))).toEqual(["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]);
  expect(days.map((d) => d.querySelector("[data-weekday]")?.textContent)).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
  expect(days.map((d) => d.querySelector("[data-date]")?.textContent)).toEqual(["15", "16", "17", "18", "19", "20", "21"]);
  expect(days.filter((d) => d.getAttribute("aria-current") === "date").map((d) => d.getAttribute("data-day"))).toEqual(["2026-11-17"]);
  expect(days.filter((d) => d.querySelector("[data-dot]")).map((d) => d.getAttribute("data-day"))).toEqual(["2026-11-16", "2026-11-17"]);
  expect(el.textContent!.includes("Nov 15 – 21")).toBe(true);
});
await test("6. Previous week, Next week, Today or a day does not call back", `${UI} → WeekStrip (onPrev, onNext, onToday, onSelect)`, async () => {
  const calls: string[] = [];
  await shown(week({ onPrev: () => calls.push("prev"), onNext: () => calls.push("next"), onToday: () => calls.push("today"), onSelect: (d) => calls.push(d) }));
  await click(byRole("button", "Previous week"));
  await click(byRole("button", "Next week"));
  await click(byRole("button", "Today"));
  await click(byRole("button", /^Thursday, November 19/));
  expect(calls).toEqual(["prev", "next", "today", "2026-11-19"]);
});
await test("7. The menu's active page is not marked with aria-current and the ribbon", `${SHELL} → .navItem[aria-current="page"]::before`, async () => {
  stubApi(routes);
  const el = fullWidth(mount(app("/schedule"), { width: 1280 }));
  const nav = await waitFor(() => el.querySelector('nav[aria-label="Main navigation"]'));
  const active = [...nav.querySelectorAll('a[aria-current="page"]')];
  expect(active.map((a) => a.textContent)).toEqual(["Schedule"]);
  const win = el.ownerDocument.defaultView!;
  const probe = el.ownerDocument.createElement("i"); probe.style.color = "var(--ribbon)"; el.append(probe);
  expect(win.getComputedStyle(active[0], "::before").backgroundColor).toBe(win.getComputedStyle(probe).color);
  const newButton = [...el.querySelectorAll("aside button")].find((b) => b.getAttribute("aria-label") === "New")!;
  expect(win.getComputedStyle(newButton).backgroundColor).toBe(win.getComputedStyle(probe).color);
});
await test("8. The page title is not the display size, has a label above it, or its actions do not line up with it", `${UI} → PageHeading (ui.module.css .pageHeading)`, async () => {
  const el = fullWidth(await shown(<PageHeading eyebrow="November 17" title="Tuesday" description="3 things due this week" actions={<button className={s.primary}>New</button>} />, 1200));
  const h1 = el.querySelector("h1")!, actions = el.querySelector("button")!.getBoundingClientRect(), title = h1.getBoundingClientRect();
  const win = el.ownerDocument.defaultView!;
  const probe = el.ownerDocument.createElement("i"); probe.style.fontSize = "var(--fs-display)"; el.append(probe);
  expect([win.getComputedStyle(h1).fontSize, parseFloat(win.getComputedStyle(h1).fontSize) >= 32]).toEqual([win.getComputedStyle(probe).fontSize, true]);
  expect(h1.previousElementSibling === null).toBe(true); // nothing sits above the title
  // The button's text sits on the title's baseline: same row, baseline alignment, boxes overlapping.
  expect([actions.left > title.right, win.getComputedStyle(h1.parentElement!).alignItems, actions.top < title.bottom, actions.bottom > title.top + title.height / 2]).toEqual([true, "baseline", true, true]);
});
await test("9. A button, field, segment, chip row or week-strip control is shorter than 44 px", `${UI} → ui.module.css (.primary, .secondary, .quiet, .danger, .segment), src/app/global.css (input, select)`, async () => {
  const el = await shown(<div>
    <button className={s.primary}>Save</button><button className={s.secondary}>Cancel</button><button className={s.quiet}>Skip</button><button className={s.danger}>Delete</button>
    <label>Title<input /></label><label>Course<select><option>CSE 442</option></select></label>
    <div className={s.segment}><button>Week</button><button className={s.activeButton}>Month</button></div>
    <Chip tone="due">Due tonight 11:59 PM</Chip><Chip>In 12 days</Chip>
    {week()}
  </div>, 375);
  const short = [...el.querySelectorAll("button, input, select")].filter((c) => height(c) < 44).map((c) => `${c.tagName} ${c.textContent || c.getAttribute("aria-label")} ${height(c)}px`);
  expect(short).toEqual([]);
  const [due, later] = [...el.querySelectorAll("[data-tone]")];
  const win = el.ownerDocument.defaultView!;
  expect(win.getComputedStyle(due).backgroundColor === win.getComputedStyle(later).backgroundColor).toBe(false);
});
await test("10. The shell scrolls sideways at 320 px, or leaves dead space beside the page at 1920 px", `${SHELL} → .main, .page`, async () => {
  stubApi(routes);
  let el = fullWidth(mount(app("/"), { width: 320 }));
  await waitFor(() => byRole("heading", "Pick up where you left off"));
  expect([pageScrollWidth() <= 320, el.ownerDocument.querySelector("main")!.scrollWidth <= 320]).toEqual([true, true]);
  stubApi(routes);
  el = fullWidth(mount(app("/notes"), { width: 1920 }));
  const main = await waitFor(() => el.ownerDocument.querySelector("main"));
  await waitFor(() => main.querySelector("h1"));
  const pageEl = main.lastElementChild!.getBoundingClientRect(), box = main.getBoundingClientRect();
  expect([pageEl.width / box.width >= 0.9, pageScrollWidth() <= 1920]).toEqual([true, true]);
});
await test("11. Reduced motion does not stop the planner's motion, or a transition is longer than 240 ms", "src/app/global.css → @media (prefers-reduced-motion), src/shared/ui.module.css", async () => {
  const rules = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules]; } catch { return []; } });
  const reduce = rules.filter((r) => r instanceof CSSMediaRule && r.conditionText.includes("prefers-reduced-motion: reduce")).map((r) => r.cssText.replace(/\s+/g, "")).join(" ");
  expect(reduce.includes("*,::before,::after{animation:")).toBe(true);
  const el = await shown(week());
  const day = el.querySelector("[data-day]")!;
  const longest = Math.max(...getComputedStyle(day).transitionDuration.split(",").map((t) => parseFloat(t) * (t.trim().endsWith("ms") ? 1 : 1000)));
  expect(longest <= 240).toBe(true);
});
await test("12. The scheme swatches do not preview each scheme's ground, sheet and ribbon, or switching scheme or mode does not change the sheet and ribbon live", "src/features/settings.tsx → SCHEMES, src/app/context.tsx → apply", async () => {
  stubApi({ ...routes, preferences: (r: { body: any }) => ({ preferences: { mode: r.body.mode, scheme: r.body.scheme } }) });
  const el = mount(app("/settings?section=appearance"));
  try {
    const swatches: Record<string, string[]> = {};
    for (const [label, sel] of [["Sage", ":root"], ["Fjord", ':root[data-scheme="fjord"]'], ["Rosé", ':root[data-scheme="rose"]'], ["Mocha", ':root[data-scheme="mocha"]']] as const) {
      const input = await waitFor(() => byLabel(label));
      swatches[label] = [...input.closest("label")!.querySelectorAll("[aria-hidden] > span")].map((sp) => (sp as HTMLElement).style.background);
      const b = block(sel);
      expect([label, ...swatches[label]]).toEqual([label, rgb(b["--ground"]), rgb(b["--sheet"]), rgb(b["--ribbon"])]);
    }
    const css = () => getComputedStyle(root);
    const now = () => [css().getPropertyValue("--sheet").trim(), css().getPropertyValue("--ribbon").trim()];
    await click(byLabel("Fjord"));
    await waitFor(() => root.dataset.scheme === "fjord");
    expect(now()).toEqual([block(':root[data-scheme="fjord"]')["--sheet"], block(':root[data-scheme="fjord"]')["--ribbon"]]);
    await click(byLabel("Dark"));
    await waitFor(() => root.dataset.theme === "dark");
    expect(now()).toEqual([block(':root[data-scheme="fjord"][data-theme="dark"]')["--sheet"], block(':root[data-scheme="fjord"][data-theme="dark"]')["--ribbon"]]);
  } finally {
    el.remove(); delete root.dataset.scheme; delete root.dataset.theme;
  }
});
