// Frontend test: Settings > Appearance with the API replaced. Every request must be scripted.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byLabel, click, waitFor } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";

page({ card: "213", title: "Frontend: Four color schemes in light and dark", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const session = (preferences?: unknown) => ({ user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token", preferences });
const signedOut = { user: null, onboarding: { completed: false, step: 0 }, csrfToken: "test-token" };
const CTX = "src/app/context.tsx → setPreferences / Provider";
const TOKENS = "src/app/tokens.css";
const routes = { notes: { notes: [] }, events: { events: [] }, courses: { courses: [] } };
const root = document.documentElement;
const ui = () => <MemoryRouter initialEntries={["/settings"]}><Provider><App /></Provider></MemoryRouter>;
const saved = (r: { body: any }) => ({ preferences: { mode: r.body.mode, scheme: r.body.scheme } });
const asked = (api: { sent: { route: string; body: any }[] }) => api.sent.filter((r) => r.route === "preferences").map((r) => r.body);

await test("1. The server's saved scheme and mode are not applied on load", CTX, async () => {
  stubApi({ ...routes, session: session({ mode: "dark", scheme: "fjord" }) });
  mount(ui());
  await waitFor(() => root.dataset.scheme === "fjord");
  expect([root.dataset.theme, root.dataset.scheme]).toEqual(["dark", "fjord"]);
  expect(byLabel("Fjord")!.checked).toBe(true);
});
await test("2. Choosing a scheme waits for the server, or sends more or less than one {mode, scheme} request", CTX, async () => {
  const api = stubApi({ ...routes, session: session({ mode: "light", scheme: "sage" }), preferences: (r) => ({ status: 200, body: saved(r), delay: 800 } as any) });
  mount(ui());
  await click(await waitFor(() => byLabel("Rosé")));
  expect(root.dataset.scheme).toBe("rose"); // before the 800 ms answer
  expect(asked(api)).toEqual([{ mode: "light", scheme: "rose" }]);
});
await test("3. Choosing a mode only changes the buttons, or sends the wrong body", CTX, async () => {
  const api = stubApi({ ...routes, session: session({ mode: "light", scheme: "mocha" }), preferences: saved });
  mount(ui());
  await click(await waitFor(() => byLabel("Dark")));
  expect(root.dataset.theme).toBe("dark");
  expect(asked(api)).toEqual([{ mode: "dark", scheme: "mocha" }]);
});
await test("4. A failed save leaves the new look on screen, or shows no message", CTX + " (the catch), src/features/settings.tsx → Appearance", async () => {
  stubApi({ ...routes, session: session({ mode: "light", scheme: "sage" }), preferences: { status: 500, body: { error: "Please try again." } } });
  mount(ui());
  await click(await waitFor(() => byLabel("Mocha")));
  const alert = await waitFor(() => document.querySelector('[role="alert"]'));
  expect(alert.textContent).toBe("Your appearance could not be saved. Please try again.");
  expect(root.dataset.scheme).toBe("sage");
  expect(byLabel("Sage")!.checked).toBe(true);
});
await test("5. The choice is still kept in this browser's storage", "src/app/context.tsx (no localStorage or sessionStorage)", async () => {
  const before = [localStorage.length, sessionStorage.length];
  stubApi({ ...routes, session: session({ mode: "light", scheme: "sage" }), preferences: saved });
  mount(ui());
  await click(await waitFor(() => byLabel("Dark")));
  await click(await waitFor(() => byLabel("Fjord")));
  expect([localStorage.getItem("notely-theme"), localStorage.length, sessionStorage.length]).toEqual([null, ...before]);
});
await test("6. Signed out does not use sage", CTX + " (refresh when signed out)", async () => {
  stubApi({ session: signedOut });
  root.dataset.scheme = "mocha";
  mount(ui());
  await waitFor(() => root.dataset.scheme === "sage");
  expect(root.dataset.scheme).toBe("sage");
});
await test("7. The controls are not two radio groups named Mode and Color scheme with the current choice checked", "src/features/settings.tsx → Appearance", async () => {
  stubApi({ ...routes, session: session({ mode: "system", scheme: "sage" }) });
  mount(ui());
  await waitFor(() => byLabel("Mocha"));
  const groups = [...document.querySelectorAll("fieldset")].map((f) => [f.querySelector("legend")?.textContent, [...f.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((i) => `${i.labels?.[0]?.textContent}${i.checked ? "*" : ""}`)]);
  expect(groups.filter(([l]) => l === "Mode" || l === "Color scheme")).toEqual([
    ["Mode", ["System*", "Light", "Dark"]],
    ["Color scheme", ["Sage*", "Fjord", "Rosé", "Mocha"]],
  ]);
});

// Contrast, from the live computed styles of every scheme and mode.
const rgb = (v: string) => { const h = v.trim().replace("#", ""); const f = h.length === 3 ? [...h].map((c) => c + c).join("") : h; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255); };
const lum = (v: string) => { const [r, g, b] = rgb(v).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
function weak(pairs: [string, string][]) {
  const [theme, scheme] = [root.dataset.theme, root.dataset.scheme];
  const bad: string[] = [];
  for (const s of ["sage", "fjord", "rose", "mocha"]) for (const t of ["light", "dark"]) {
    root.dataset.scheme = s; root.dataset.theme = t;
    const css = getComputedStyle(root);
    for (const [fg, bg] of pairs) {
      const r = ratio(css.getPropertyValue(fg), css.getPropertyValue(bg));
      if (r < 4.5) bad.push(`${s} ${t}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs 4.5:1`);
    }
  }
  root.dataset.theme = theme; root.dataset.scheme = scheme;
  return bad;
}
await test("8. Text is hard to read on the page or a card in some scheme", TOKENS + " → --text, --bg, --surface", async () => {
  expect(weak([["--text", "--bg"], ["--text", "--surface"]])).toEqual([]);
});
await test("9. Muted text is hard to read on the page in some scheme", TOKENS + " → --muted, --bg", async () => {
  expect(weak([["--muted", "--bg"]])).toEqual([]);
});
await test("10. Button text is hard to read on the primary color in some scheme", TOKENS + " → --primary, --primary-text", async () => {
  expect(weak([["--primary-text", "--primary"]])).toEqual([]);
});
