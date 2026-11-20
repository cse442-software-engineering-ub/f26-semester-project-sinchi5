// Frontend test: card 256, Friends, Settings and the landing page on planner sheets. The real screens, the API replaced.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import "../../../src/features/onboarding.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byLabel, byText, click, type, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";
import { buildPalette, contrastRatio } from "../../../src/services/palette";

page({ card: "256", title: "Frontend: Friends, Settings and the landing page sit on planner sheets", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const forest = { id: "a1a1a1a1a1a1a1a1", name: "Forest", accent: "#3f7d4e", background: "#f3f7f2", text: "#1f2d24" };
const session = (extra: Record<string, unknown> = {}) => ({ user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token", preferences: { mode: "light", scheme: "sage" }, ...extra });
type P = { id: string; userId: string; name: string; email: string };
const p = (id: string, name: string): P => ({ id: "f" + id, userId: id, name, email: `${id}@example.edu` });
const lists = (friends: P[] = [], incoming: P[] = [], outgoing: P[] = []) => ({ friends, incoming, outgoing });
const routes = (extra: Record<string, unknown> = {}) => ({
  session: session(), notes: { notes: [] }, events: { events: [] }, courses: { courses: [] }, "course-notes-shares": { shares: [] },
  "shared-notes": { notes: [] }, friends: lists(), ...extra,
});
const at = (path: string) => <MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>;
const out = { user: null, onboarding: { completed: false, step: 0 }, csrfToken: "test-token" };
const landing = (path = "/") => <MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>;
const eight = Array.from({ length: 8 }, (_, i) => p(String(20 + i), "Friend " + i));
// byLabel does not recognise inputs inside a phone-width iframe (a different realm), so labels are read from the DOM.
const lab = (text: string) => [...([...document.querySelectorAll("iframe")].at(-1)?.contentDocument ?? document).querySelectorAll("label")].find((l) => l.textContent?.trim() === text)?.querySelector("input") ?? null;
const rect = (el: Element | null | undefined) => el!.getBoundingClientRect();
// The runner page gives its body a reading column; the app under test is not part of that.
const doc = (el: HTMLElement) => { Object.assign(el.ownerDocument.body.style, { maxWidth: "none", padding: "0", margin: "0" }); return el.ownerDocument; };
const pages = (d: Document) => [...d.querySelectorAll("[data-page]")];
const FR = "src/features/friends.tsx → Friends, src/features/friends.module.css";
const SE = "src/features/settings.tsx → Settings, src/features/settings.module.css";
const AP = "src/features/settings.tsx → Appearance, src/features/appearance.module.css";
const LA = "src/features/onboarding.tsx → Onboarding, src/features/onboarding.module.css";

// The iframe has its own <html>: set a scheme there (or a custom theme's variables) and the rendered text colors follow.
const look = (d: Document, scheme: string, theme: string, custom?: Record<string, string>) => {
  const r = d.documentElement;
  r.dataset.scheme = scheme; r.dataset.theme = theme;
  for (const [k, v] of Object.entries(custom ?? {})) r.style.setProperty(k, v);
};
const hex = (c: string) => "#" + (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((n) => Math.round(+n).toString(16).padStart(2, "0")).join("");
const low = (el: Element | null, bg: Element | null) => {
  const r = contrastRatio(hex(getComputedStyle(el!).color), hex(getComputedStyle(bg!).backgroundColor));
  return r >= 4.5 ? null : r.toFixed(2);
};

await test("1. Friends is not a spread: the add form and the two request lists on the left page, Your friends on the right, or the pages do not sit side by side at 1440", FR, async () => {
  stubApi(routes({ friends: lists(eight, [p("6", "Katherine Johnson")], [p("7", "Margaret Hamilton")]) }));
  const d = doc(mount(at("/friends"), { width: 1440 }));
  await waitFor(() => byText("Friend 7"));
  const [left, right] = pages(d);
  const inside = (page: Element, name: string) => !![...page.querySelectorAll("h2")].find((h) => h.textContent === name);
  expect([inside(left, "Add a classmate"), inside(left, "Requests for you"), inside(left, "Sent requests"), inside(right, "Your friends")]).toEqual([true, true, true, true]);
    expect(rect(left).right <= rect(right).left).toBe(true);
  expect(Math.round(rect(left).top)).toBe(Math.round(rect(right).top));
});
await test("2. The friend cards are not an aligned grid (same top and height per row, three columns at 1920), or Remove is a loud button", FR + " (.friendGrid, .friendCard, .remove)", async () => {
  stubApi(routes({ friends: lists(eight) }));
  const d = doc(mount(at("/friends"), { width: 1920 }));
  await waitFor(() => byText("Friend 7"));
  const cards = [...d.querySelectorAll('section[aria-labelledby="friend-list-heading"] li')];
  expect(cards.length).toBe(8);
  const lefts = [...new Set(cards.map((c) => Math.round(rect(c).left)))];
  expect(lefts.length >= 3).toBe(true);
  expect(new Set(cards.slice(0, lefts.length).map((c) => Math.round(rect(c).top))).size).toBe(1);
  expect(new Set(cards.map((c) => Math.round(rect(c).height))).size).toBe(1);
  expect(cards.every((c) => c.querySelector("img, [class*=avatar]") && c.querySelector("strong") && c.querySelector("small") && c.querySelector("button")?.textContent === "Remove")).toBe(true);
  expect(getComputedStyle(byRole("button", "Remove Friend 0")!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
});
await test("3. Friends does not stack on a 375 px phone (left page first, one card column), or an empty account shows generic text", FR, async () => {
  stubApi(routes({ friends: lists(eight) }));
  let d = doc(mount(at("/friends"), { width: 375 }));
  await waitFor(() => byText("Friend 7"));
  const [left, right] = pages(d);
  expect(rect(left).bottom <= rect(right).top + 1).toBe(true);
  expect(new Set([...right.querySelectorAll("li")].map((c) => Math.round(rect(c).left))).size).toBe(1);
  stubApi(routes());
  d = doc(mount(at("/friends"), { width: 1440 }));
  await waitFor(() => byText("No friends yet. Add a classmate by email."));
  expect(byText("No requests waiting for you.") !== null && byText("You have no pending requests.") !== null).toBe(true);
});
await test("4. Settings is not one sheet with the section index on the left page (ribbon on the open tab) and the section on the facing page", SE, async () => {
  stubApi(routes());
  const d = doc(mount(at("/settings"), { width: 1440 }));
  const nav = await waitFor(() => d.querySelector('nav[aria-label="Settings sections"]'));
  const [left, right] = pages(d);
  expect(left.contains(nav) && right.contains(right.querySelector("#account-section")) && !left.contains(right)).toBe(true);
  const tabs = [...nav.querySelectorAll("a")];
  expect(tabs.map((a) => a.querySelector("strong")?.textContent)).toEqual(["Account", "Appearance", "Data"]);
  const ribbon = (a: Element) => getComputedStyle(a, "::after").content;
  expect(tabs.map((a) => ribbon(a) === '""')).toEqual([true, false, false]);
  expect(rect(left).right <= rect(right).left).toBe(true);
  await click(tabs[2] as HTMLElement);
  await waitFor(() => d.querySelector("#data-section"));
  expect(d.querySelector("#account-section")).toBe(null);
  expect(nav.querySelector('[aria-current="true"]')!.textContent!.startsWith("Data")).toBe(true);
});
await test("5. Data lost its CLEAR confirmation, or Clear workspace works without typing CLEAR", SE + " (Data)", async () => {
  stubApi(routes());
  mount(at("/settings?section=data"));
  await click(await waitFor(() => byRole("button", "Clear workspace")));
  const dialog = await waitFor(() => document.querySelector('[role="dialog"]') as HTMLElement);
  const go = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Clear workspace") as HTMLButtonElement;
  expect(go.disabled).toBe(true);
  await type(byLabel("Type CLEAR to confirm"), "CLEAR");
  expect(go.disabled).toBe(false);
});
await test("6. Appearance does not show every scheme and custom theme as a mini planner (ground, sheet, ribbon in its own colors), or mode as a segmented control", AP, async () => {
  stubApi(routes({ session: session({ preferences: { mode: "light", scheme: "sage", customThemes: [forest] } }) }));
  doc(mount(at("/settings?section=appearance"), { width: 1440 }));
  await waitFor(() => lab("Forest"));
  const colors = (label: string) => [...lab(label)!.closest("label")!.querySelectorAll("[aria-hidden] > span")].map((s) => (s as HTMLElement).style.background);
  for (const name of ["Sage", "Fjord", "Rosé", "Mocha", "Forest"]) expect([name, colors(name).length]).toEqual([name, 3]);
  const built = buildPalette(forest).light;
  const forestColors = [...lab("Forest")!.closest("label")!.querySelectorAll("[aria-hidden] > span")].map((s) => getComputedStyle(s).backgroundColor);
  expect(forestColors).toEqual([built["--ground"], built["--sheet"], built["--ribbon"]].map((h) => `rgb(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ")})`));
  const mini = lab("Fjord")!.closest("label")!.querySelector("[aria-hidden]")!;
  expect(rect(mini).width > 100 && rect(mini).height > 50).toBe(true);
  const radios = ["System", "Light", "Dark"].map((l) => lab(l)!.closest("label")!);
  expect(new Set(radios.map((r) => Math.round(rect(r).top))).size).toBe(1);
  expect(new Set(radios.map((r) => Math.round(rect(r).width))).size).toBe(1);
  expect(radios.every((r) => rect(r).height >= 44)).toBe(true);
});
await test("7. The landing page does not lead with Log in beside a sample day on a wide screen, or does not stack with the form first on a phone, or loses Log in to continue", LA, async () => {
  stubApi({ session: out });
  let d = doc(mount(landing("/notes"), { width: 1440 }));
  await waitFor(() => byRole("button", "Log in"));
  const [form, sample] = pages(d);
  expect(form.contains(lab("Email address")) && sample.contains(d.querySelector("[aria-hidden] b")) && rect(form).right <= rect(sample).left).toBe(true);
  expect(sample.textContent!.includes("Example day")).toBe(true);
  const status = byRole("status", "Log in to continue.")!;
  expect(rect(status).top < rect(lab("Email address")!).top && form.contains(status)).toBe(true);
  stubApi({ session: out });
  d = doc(mount(landing(), { width: 375 }));
  await waitFor(() => byRole("button", "Log in"));
  expect(rect(pages(d)[0]).bottom <= rect(pages(d)[1]).top + 1).toBe(true);
  expect(rect(byRole("button", "Log in")!).bottom < 700).toBe(true);
  await click(byRole("button", "Create account"));
  await waitFor(() => lab("Confirm password"));
  expect(pages(d)[0].contains(lab("Your name"))).toBe(true);
  await click(byRole("button", "Already have an account? Log in"));
  await click(await waitFor(() => byRole("button", "Forgot password?")));
  await waitFor(() => byRole("heading", "Recover your account."));
  expect(pages(d)[0].contains(lab("Recovery code"))).toBe(true);
});
await test("8. Friends, Settings or the landing page scrolls sideways on a 320 px phone, with very long names or the sign up form", FR + ", " + SE + ", " + LA, async () => {
  const long = (n: string): P => ({ id: "f" + n, userId: n, name: "N".repeat(70), email: "e".repeat(90) + "@example.edu" });
  for (const [path, data, wait] of [
    ["/friends", routes({ friends: lists([long("2")], [long("3")], [long("4")]) }), () => byRole("heading", "Your friends")],
    ["/settings?section=appearance", routes({ session: session({ preferences: { mode: "light", scheme: "sage", customThemes: [forest] } }) }), () => lab("Forest")],
    ["/settings", routes({ session: session({ user: { ...ada, name: "N".repeat(70), email: "e".repeat(90) + "@example.edu" } }) }), () => byRole("button", "Delete account")],
  ] as const) {
    stubApi(data);
    mount(at(path), { width: 320 });
    await waitFor(wait);
    expect([path, pageScrollWidth() <= 320]).toEqual([path, true]);
  }
  stubApi({ session: out });
  mount(landing(), { width: 320 });
  await click(await waitFor(() => byRole("button", "Create account")));
  await waitFor(() => lab("Confirm password"));
  expect(pageScrollWidth() <= 320).toBe(true);
});
await test("9. Body text is under 4.5:1 on the sheet in a dark scheme or a custom theme on Friends, Settings or the landing page", FR + ", " + SE + ", " + LA + " (colors only from variables)", async () => {
  const custom = buildPalette(forest);
  const looks: [string, string, Record<string, string>?][] = [["fjord", "dark"], ["mocha", "dark"], ["custom:x", "light", custom.light as unknown as Record<string, string>], ["custom:x", "dark", custom.dark as unknown as Record<string, string>]];
  const fails: string[] = [];
  const screens: [string, unknown, JSX.Element, string, string][] = [
    ["friends", routes({ friends: lists(eight.slice(0, 2), [p("6", "Katherine Johnson")]) }), at("/friends"), '[aria-labelledby="friend-add-heading"] h2', "[data-page]"],
    ["settings", routes(), at("/settings?section=appearance"), "#appearance-section h2", "[data-page]"],
    ["landing", { session: out }, landing(), "h1", "[data-page]"],
  ];
  for (const [name, data, ui, heading, sheet] of screens) {
    for (const [scheme, theme, vars] of looks) {
      stubApi(data as Record<string, unknown>);
      const d = doc(mount(ui, { width: 1440 }));
      look(d, scheme, theme, vars);
      await waitFor(() => d.querySelector(heading));
      const bg = d.querySelector(sheet)!.closest("section") ?? d.querySelector(sheet)!;
      for (const el of [d.querySelector(heading), d.querySelector("[data-page] p, [data-page] small, [data-page] label")]) {
        const r = low(el, bg);
        if (r) fails.push(`${name} ${scheme} ${theme} ${r}`);
      }
    }
  }
  expect(fails).toEqual([]);
});
