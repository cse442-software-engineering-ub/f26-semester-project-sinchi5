// Frontend test: each screen still renders after the stylesheet split, and every color follows the scheme. API replaced.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, byLabel, byText, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";
import { Onboarding } from "../../../src/features/onboarding";
import ui from "../../../src/shared/ui.module.css";
import richEditor from "../../../src/features/rich-editor.module.css";

page({ card: "222", title: "Frontend: Split the stylesheet by feature and make every color follow the scheme", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const signedIn = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" };
const signedOut = { user: null, onboarding: { completed: false, step: 0 }, csrfToken: "test-token" };
const cse442 = { id: "c1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const note1 = { id: "n1", courseId: "c1", title: "Agile notes", body: "Sprint planning", lectureDate: "2026-09-01", category: "School", tags: [], pinned: false, visibility: "private", updatedAt: "2026-09-01T12:00:00Z", createdAt: "2026-09-01T12:00:00Z", ownerId: "1", checklist: [] };
const routes = (extra: Record<string, unknown> = {}) => ({
  session: signedIn, notes: { notes: [note1] }, events: { events: [] }, courses: { courses: [cse442] }, "course-notes-shares": { shares: [] },
  "shared-notes": { notes: [] }, friends: { friends: [], incoming: [], outgoing: [] }, ...extra,
});
const at = (path: string, width?: number) => mount(<MemoryRouter initialEntries={[path]}><Provider><App /></Provider></MemoryRouter>, { width });
const root = document.documentElement;
const SCHEMES = ["sage", "fjord", "rose", "mocha"];
const MODES = ["light", "dark"];
const use = (scheme: string, mode = "light") => { root.dataset.scheme = scheme; root.dataset.theme = mode; };
const find = (part: string) => document.querySelector<HTMLElement>(`[class*="${part}"]`)!;
const css = (el: Element, prop: "color" | "backgroundColor") => getComputedStyle(el)[prop];
const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const lum = (c: string) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const variable = (name: string) => { const probe = document.createElement("i"); probe.style.color = `var(${name})`; document.body.append(probe); const v = getComputedStyle(probe).color; probe.remove(); return v; };
// Both colors of one element under two schemes; they must differ for the element to follow the scheme.
async function followsScheme(prop: "color" | "backgroundColor", pick: () => Element | null, light = "sage", other = "fjord") {
  use(light); const a = css((await waitFor(pick))!, prop);
  use(other); const b = css(pick()!, prop);
  expect([a, b].every(Boolean) && a !== b).toBe(true);
}

await test("1. Today, Schedule or Assignments no longer shows its heading after the split", "src/features/dashboard.tsx, schedule.tsx, assignments.tsx", async () => {
  use("sage"); stubApi(routes());
  at("/"); await waitFor(() => byRole("heading", /Good (morning|afternoon|evening)/));
  at("/schedule"); await waitFor(() => byRole("heading", "Your schedule"));
  at("/assignments"); await waitFor(() => byRole("heading", "Assignments"));
});
await test("2. Notes, an open note or a course page no longer shows its heading after the split", "src/features/notes-list.tsx, note-editor.tsx, course-page.tsx", async () => {
  use("sage"); stubApi(routes({ note: { note: note1 }, "note-comments": { comments: [] }, "note-versions": { versions: [] }, "note-collaborators": { collaborators: [] } }));
  at("/notes"); await waitFor(() => byRole("heading", "Your notes"));
  at("/notes/n1"); expect((await waitFor(() => byLabel("Note title"))).value).toBe("Agile notes");
  at("/courses/c1"); await waitFor(() => byRole("heading", "Software Engineering"));
});
await test("3. Friends or Settings no longer shows its heading after the split", "src/features/friends.tsx, settings.tsx", async () => {
  use("sage"); stubApi(routes());
  at("/friends"); await waitFor(() => byRole("heading", "Friends"));
  at("/settings"); await waitFor(() => byRole("heading", "Settings"));
});
await test("4. The landing page's sample day keeps one color in every scheme", "src/features/onboarding.module.css → .day (--ground in src/app/tokens.css)", async () => {
  stubApi({ session: signedOut });
  mount(<MemoryRouter initialEntries={["/"]}><Provider><Onboarding /></Provider></MemoryRouter>);
  await followsScheme("backgroundColor", () => document.querySelector('[class*="day"]'));
});
await test("5. The Now ribbon keeps one color in every scheme", "src/features/dashboard.module.css → .ribbon (--ribbon in src/app/tokens.css)", async () => {
  stubApi(routes()); at("/");
  await followsScheme("backgroundColor", () => document.querySelector("[data-ribbon]"));
});
await test("6. The avatar keeps one color in every scheme", "src/shared/ui.module.css → .avatar (--tint-a in src/app/tokens.css)", async () => {
  stubApi(routes()); at("/");
  await followsScheme("backgroundColor", () => document.querySelector('[class*="avatar"]'));
});
await test("7. Error text keeps one color in every scheme", "src/shared/ui.module.css → .error (--danger in src/app/tokens.css)", async () => {
  mount(<p className={ui.error}>That did not work.</p>); // the shared error style every screen uses
  await followsScheme("color", () => document.querySelector(`.${ui.error}`), "sage", "fjord");
});
await test("8. Danger text is under 4.5:1 on its background or on the card in one of the eight combinations", "src/app/tokens.css → --danger, --danger-soft, --surface", async () => {
  const bad: string[] = [];
  for (const s of SCHEMES) for (const m of MODES) {
    use(s, m);
    const [d, soft, surface] = [variable("--danger"), variable("--danger-soft"), variable("--surface")];
    for (const [name, bg] of [["--danger-soft", soft], ["--surface", surface]]) {
      const c = contrast(d, bg);
      if (c < 4.5) bad.push(`${s}-${m} on ${name}: ${c.toFixed(2)}`);
    }
  }
  expect(bad).toEqual([]);
});
await test("9. A note highlight is the same color in light and dark", "src/features/rich-editor.module.css → mark[data-color=yellow] (--highlight-yellow in src/app/tokens.css)", async () => {
  mount(<div className={richEditor.content}><div className="ProseMirror"><mark data-color="yellow">marked</mark></div></div>);
  use("sage", "light"); const light = css(await waitFor(() => document.querySelector<HTMLElement>("mark")), "backgroundColor");
  use("sage", "dark"); const dark = css(document.querySelector<HTMLElement>("mark")!, "backgroundColor");
  expect(light !== dark && !!light && !!dark).toBe(true);
});
await test("10. Today scrolls sideways on a 320 px phone", "src/features/dashboard.module.css, src/shared/ui.module.css", async () => {
  use("sage"); stubApi(routes()); at("/", 320);
  await waitFor(() => byText("TODAY") ?? byRole("heading", /Good (morning|afternoon|evening)/));
  expect(pageScrollWidth() <= 320).toBe(true);
});
