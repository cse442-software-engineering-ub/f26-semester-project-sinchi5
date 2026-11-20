// Frontend test: Settings > Appearance > Your themes with the API replaced. Every request must be scripted.
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byLabel, byRole, byText, click, type, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";
import { buildPalette } from "../../../src/services/palette";

page({ card: "234", title: "Frontend: Make up to four custom themes that follow me to every device", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const forest = { id: "a1a1a1a1a1a1a1a1", name: "Forest", accent: "#2f6b3c", background: "#f4f7f2", text: "#1f2a24" };
const dusk = { id: "b2b2b2b2b2b2b2b2", name: "Dusk", accent: "#b48ead", background: "#2e3440", text: "#eceff4" };
const four = [forest, dusk, { ...forest, id: "c3c3c3c3c3c3c3c3", name: "Sand" }, { ...forest, id: "d4d4d4d4d4d4d4d4", name: "Ink" }];
const CTX = "src/app/context.tsx → Provider (apply effect), saveTheme, deleteTheme";
const SET = "src/features/settings.tsx → Appearance, ThemeEditor";
const root = document.documentElement;
const ui = () => <MemoryRouter initialEntries={["/settings"]}><Provider><App /></Provider></MemoryRouter>;
const routes = { notes: { notes: [] }, events: { events: [] }, courses: { courses: [] } };
const LIMIT = "You can save up to 4 themes. Delete one to add another.";
const sent = (api: { sent: { route: string; body: any }[] }, route: string) => api.sent.filter((r) => r.route === route).map((r) => r.body);
const inline = (name: string) => root.style.getPropertyValue(name);

// A tiny server: themes live here, the three routes answer like backend/lib/preferences.php.
function server(start: { mode: string; scheme: string; themes: any[] }, extra: Record<string, unknown> = {}) {
  root.removeAttribute("style"); // the previous case may have left custom variables on <html>
  const db = { mode: start.mode, scheme: start.scheme, themes: [...start.themes] };
  const prefs = () => ({ preferences: { mode: db.mode, scheme: db.scheme, customThemes: db.themes } });
  return stubApi({
    ...routes,
    session: { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token", ...prefs() },
    preferences: (r) => { db.mode = r.body.mode; db.scheme = r.body.scheme; return prefs(); },
    "theme-save": (r) => {
      const { id, ...rest } = r.body;
      if (id) db.themes = db.themes.map((t) => (t.id === id ? { id, ...rest } : t));
      else db.themes.push({ id: "e5e5e5e5e5e5e5e5", ...rest });
      return prefs();
    },
    "theme-delete": (r) => { db.themes = db.themes.filter((t) => t.id !== r.body.id); if (db.scheme === `custom:${r.body.id}`) db.scheme = "sage"; return prefs(); },
    ...extra,
  });
}

await test("1. Saved themes from the session are not listed as choices, or the active one is not applied on load", CTX, async () => {
  server({ mode: "light", scheme: `custom:${forest.id}`, themes: [forest, dusk] });
  mount(ui());
  await waitFor(() => byLabel("Forest"));
  await waitFor(() => root.dataset.scheme === `custom:${forest.id}`);
  expect(byLabel("Dusk")!.checked).toBe(false);
  expect(byLabel("Forest")!.checked).toBe(true);
  expect(inline("--primary")).toBe(buildPalette(forest).light["--primary"]);
  expect(inline("--danger")).toBe(buildPalette(forest).light["--danger"]); // the semantic variables too
});
await test("2. New theme does not open the editor with the name and three labeled color fields", SET, async () => {
  server({ mode: "light", scheme: "sage", themes: [] });
  mount(ui());
  await click(await waitFor(() => byRole("button", "New theme")));
  await waitFor(() => byLabel("Theme name"));
  for (const label of ["Accent", "Background", "Text"]) expect(byLabel(label)!.type).toBe("color");
  expect(/^#[0-9a-f]{6}$/.test(byLabel("Accent")!.value)).toBe(true); // starts from the colors on screen
  expect(document.querySelectorAll("[data-preview]").length).toBe(2);
});
await test("3. Changing a color does not update the light and dark preview", SET + " → ThemeEditor (buildPalette)", async () => {
  server({ mode: "light", scheme: "sage", themes: [] });
  mount(ui());
  await click(await waitFor(() => byRole("button", "New theme")));
  const preview = (m: string) => (document.querySelector(`[data-preview="${m}"]`) as HTMLElement).style.getPropertyValue("--primary");
  const before = preview("light");
  await type(await waitFor(() => byLabel("Accent")), "#cc2200");
  expect(preview("light") === before).toBe(false);
  expect(preview("light")).toBe(buildPalette({ accent: "#cc2200", background: byLabel("Background")!.value, text: byLabel("Text")!.value }).light["--primary"]);
  expect(preview("dark") === preview("light")).toBe(false);
});
await test("4. Save does not post the name and three colors, or the new theme is not selected and applied", CTX + "; " + SET, async () => {
  const api = server({ mode: "light", scheme: "sage", themes: [] });
  mount(ui());
  await click(await waitFor(() => byRole("button", "New theme")));
  await type(await waitFor(() => byLabel("Theme name")), "Ocean");
  await type(byLabel("Accent"), "#336699");
  await type(byLabel("Background"), "#eef3f8");
  await type(byLabel("Text"), "#102030");
  await click(byRole("button", "Save"));
  await waitFor(() => root.dataset.scheme === "custom:e5e5e5e5e5e5e5e5");
  expect(sent(api, "theme-save")).toEqual([{ name: "Ocean", accent: "#336699", background: "#eef3f8", text: "#102030" }]);
  expect(sent(api, "preferences")).toEqual([{ mode: "light", scheme: "custom:e5e5e5e5e5e5e5e5" }]);
  expect(inline("--primary")).toBe(buildPalette({ accent: "#336699", background: "#eef3f8", text: "#102030" }).light["--primary"]);
  await waitFor(() => byLabel("Ocean")?.checked);
  expect(byLabel("Theme name")).toBe(null); // the editor closed
});
await test("5. Switching light and dark does not swap the custom variables", CTX, async () => {
  server({ mode: "light", scheme: `custom:${dusk.id}`, themes: [dusk] });
  mount(ui());
  await waitFor(() => inline("--bg"));
  expect(inline("--bg")).toBe(buildPalette(dusk).light["--bg"]);
  await click(byLabel("Dark"));
  expect(root.dataset.theme).toBe("dark");
  expect(inline("--bg")).toBe(buildPalette(dusk).dark["--bg"]);
  expect(inline("--bg")).toBe("#2e3440");
});
await test("6. Choosing a built-in scheme leaves the custom variables on the page", CTX, async () => {
  server({ mode: "light", scheme: `custom:${forest.id}`, themes: [forest] });
  mount(ui());
  await waitFor(() => inline("--primary"));
  await click(byLabel("Fjord"));
  expect(root.dataset.scheme).toBe("fjord");
  expect((root.getAttribute("style") ?? "").includes("--")).toBe(false);
  expect(inline("--primary")).toBe("");
});
await test("7. Delete does not ask first, or does not post theme-delete, or does not fall back to the previous built-in scheme", SET + " → Appearance (delete dialog), " + CTX, async () => {
  const api = server({ mode: "light", scheme: "fjord", themes: [forest, dusk] });
  mount(ui());
  await click(await waitFor(() => byLabel("Forest")));
  await waitFor(() => root.dataset.scheme === `custom:${forest.id}`);
  await click(byRole("button", "Delete Forest"));
  await waitFor(() => byText("Delete this theme?"));
  expect(sent(api, "theme-delete")).toEqual([]); // asked first
  await click(byRole("button", "Delete"));
  await waitFor(() => root.dataset.scheme === "fjord");
  expect(sent(api, "theme-delete")).toEqual([{ id: forest.id }]);
  expect(byLabel("Forest")).toBe(null);
  expect(byLabel("Fjord")!.checked).toBe(true);
  expect(inline("--primary")).toBe("");
});
await test("8. A fifth theme is allowed, or the refusal has no explanation", SET + " → Appearance (New theme)", async () => {
  const api = server({ mode: "light", scheme: "sage", themes: four });
  mount(ui());
  await waitFor(() => byLabel("Ink"));
  const add = byRole("button", "New theme") as HTMLButtonElement;
  expect(add.disabled).toBe(true);
  expect(byText(LIMIT) !== null).toBe(true);
  expect(add.getAttribute("aria-describedby")).toBe(byText(LIMIT)!.id);
  await click(add);
  expect(byLabel("Theme name")).toBe(null);
  expect(sent(api, "theme-save")).toEqual([]);
});
await test("9. A server validation error is not shown next to its field", SET + " → ThemeEditor (catch)", async () => {
  server({ mode: "light", scheme: "sage", themes: [] }, { "theme-save": { status: 422, body: { error: "Enter a theme name of 1 to 30 visible characters." } } });
  mount(ui());
  await click(await waitFor(() => byRole("button", "New theme")));
  await click(await waitFor(() => byRole("button", "Save")));
  const note = await waitFor(() => byText("Enter a theme name of 1 to 30 visible characters."));
  const name = byLabel("Theme name")!;
  expect(name.getAttribute("aria-invalid")).toBe("true");
  expect(name.getAttribute("aria-describedby")).toBe(note.id);
  expect(note.getAttribute("role")).toBe("alert");
  expect(root.dataset.scheme).toBe("sage");
});
await test("10. Edit does not send the theme's id, or Cancel sends anything", SET + " → ThemeEditor", async () => {
  const api = server({ mode: "light", scheme: "sage", themes: [forest] });
  mount(ui());
  await click(await waitFor(() => byRole("button", "Edit Forest")));
  expect(byLabel("Theme name")!.value).toBe("Forest");
  await click(byRole("button", "Cancel"));
  expect(byLabel("Theme name")).toBe(null);
  expect(sent(api, "theme-save")).toEqual([]);
  await click(byRole("button", "Edit Forest"));
  await type(byLabel("Theme name"), "Forest 2");
  await click(byRole("button", "Save"));
  await waitFor(() => byLabel("Forest 2")?.checked);
  expect(sent(api, "theme-save")).toEqual([{ id: forest.id, name: "Forest 2", accent: forest.accent, background: forest.background, text: forest.text }]);
});
await test("11. Low-contrast colors are not explained as nudged for readability", SET + " → ThemeEditor (adjusted note)", async () => {
  server({ mode: "light", scheme: "sage", themes: [] });
  mount(ui());
  await click(await waitFor(() => byRole("button", "New theme")));
  await type(await waitFor(() => byLabel("Background")), "#ffffff");
  await type(byLabel("Text"), "#fefefe");
  await waitFor(() => byText(/nudged your text color/));
  await type(byLabel("Text"), "#101010");
  await waitFor(() => !byText(/nudged your text color/));
});
await test("12. The editor with four themes and long names scrolls sideways at 320 px", "src/features/appearance.module.css → .editor, .options", async () => {
  const long = four.map((t, i) => ({ ...t, name: `A very long theme name ${i} xxxxxxxx` }));
  server({ mode: "light", scheme: `custom:${long[0].id}`, themes: long });
  mount(ui(), { width: 320 });
  await click(await waitFor(() => byRole("button", "Edit A very long theme name 0 xxxxxxxx")));
  await waitFor(() => byRole("button", "Cancel")); // byLabel cannot read inputs inside an iframe (other realm), so the editor is found by its button
  expect(pageScrollWidth() <= 320).toBe(true);
});
