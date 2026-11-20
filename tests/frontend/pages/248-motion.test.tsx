// Frontend test: card 248, gentle motion and a few small delights, on the real app with the API replaced.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, click, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";
import { celebratedDays, seasonGlyph } from "../../../src/features/dashboard";

page({ card: "248", title: "Frontend: Gentle motion and small delights", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const cse442 = { id: "c1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const routes = {
  session: { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" }, notes: { notes: [] }, events: { events: [] },
  courses: { courses: [cse442] }, "course-notes-shares": { shares: [] }, "shared-notes": { notes: [] }, friends: { friends: [], incoming: [], outgoing: [] },
};
const at = () => <MemoryRouter initialEntries={["/"]}><Provider><App /></Provider></MemoryRouter>;
const burst = () => document.querySelector<HTMLElement>("[data-burst]");
const logo = () => document.querySelector<HTMLElement>("aside a > span");
const realMatchMedia = window.matchMedia;

await test("1. The shared motion variables are missing or outside 120 to 240 ms", "src/app/tokens.css → :root", async () => {
  const css = getComputedStyle(document.documentElement);
  for (const [name, want] of [["--motion-fast", "120ms"], ["--motion-base", "180ms"], ["--motion-slow", "240ms"]]) expect(css.getPropertyValue(name).trim().replace(/^\.12s$/, "120ms").replace(/^\.18s$/, "180ms").replace(/^\.24s$/, "240ms")).toBe(want); // the browser may print seconds
  expect(css.getPropertyValue("--ease-out").includes("cubic-bezier")).toBe(true);
});
await test("2. Reduced motion does not switch the burst, the logo flourish and the animations off", "src/app/global.css → @media (prefers-reduced-motion)", async () => {
  const rules = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } })
    .filter((r) => r instanceof CSSMediaRule && r.conditionText.includes("prefers-reduced-motion: reduce")).map((r) => r.cssText.replace(/\s+/g, "")).join(" ");
  for (const want of ["*,::before,::after{animation:", "[data-burst]", "[data-flourish]"]) expect(rules.includes(want) ? want : rules.slice(0, 300)).toBe(want);
});
await test("3. The burst is missing on an empty day, can be clicked, or never goes away", "src/features/dashboard.tsx → Dashboard (burst), dashboard.module.css (.burst)", async () => {
  celebratedDays.clear();
  stubApi(routes);
  mount(at());
  const b = await waitFor(burst);
  expect(getComputedStyle(b).pointerEvents).toBe("none");
  expect(b.children.length > 5).toBe(true);
  await waitFor(() => burst() === null, 2000);
});
await test("4. The burst repeats on the same day in one session, or shows for someone who asked for reduced motion", "src/features/dashboard.tsx → Dashboard (celebratedDays, calm)", async () => {
  stubApi(routes);
  mount(at());
  await waitFor(() => byRole("heading", "Pick up where you left off"));
  expect(burst() === null).toBe(true);
  celebratedDays.clear();
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  try {
    mount(at());
    await waitFor(() => byRole("heading", "Pick up where you left off"));
    expect(burst() === null).toBe(true);
  } finally { window.matchMedia = realMatchMedia; }
});
await test("5. The logo flourishes before the fifth click within 2 s, or not at the fifth", "src/app/App.tsx → useLogoFlourish", async () => {
  stubApi(routes);
  mount(at());
  const mark = await waitFor(logo);
  for (let i = 0; i < 4; i++) await click(mark.closest("a"));
  expect(mark.hasAttribute("data-flourish")).toBe(false);
  await click(mark.closest("a"));
  await waitFor(() => mark.hasAttribute("data-flourish"));
  await waitFor(() => !mark.hasAttribute("data-flourish"), 2000);
});
await test("6. The seasonal accent picks the wrong glyph for November, January or a summer month", "src/features/dashboard.tsx → seasonGlyph", async () => {
  expect(seasonGlyph(new Date(2026, 10, 17))).toBe("leaf");
  expect(seasonGlyph(new Date(2027, 0, 10))).toBe("snow");
  expect(seasonGlyph(new Date(2026, 6, 1))).toBe(null);
  stubApi(routes);
  mount(at());
  await waitFor(() => byRole("heading", "Pick up where you left off"));
  expect(document.querySelector("[data-season]")?.getAttribute("data-season") ?? null).toBe(seasonGlyph(new Date()));
});
await test("7. A window no longer opens from Add course, or Escape no longer closes it", "src/shared/ui.tsx → Modal", async () => {
  stubApi(routes);
  mount(at());
  await click(await waitFor(() => byRole("button", "Add course")));
  await waitFor(() => byRole("dialog"));
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await waitFor(() => byRole("dialog") === null);
});
await test("8. The page scrolls sideways at 320 px while the burst plays", "src/features/dashboard.module.css (.burst)", async () => {
  celebratedDays.clear();
  stubApi(routes);
  const root = mount(at(), { width: 320 });
  await waitFor(() => root.ownerDocument.querySelector("[data-burst]"));
  expect(pageScrollWidth() <= 320).toBe(true);
});
