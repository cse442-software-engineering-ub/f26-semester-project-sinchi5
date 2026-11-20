// Frontend test: the Settings page with the API replaced. Every request must be scripted.
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

page({ card: "214", title: "Frontend: Settings in Account, Appearance and Data", kind: "frontend" });

const ada = { id: "1", name: "Ada Lovelace", email: "ada@example.edu", hasPhoto: false };
const session = { user: ada, onboarding: { completed: true, step: 3 }, csrfToken: "test-token", preferences: { mode: "light", scheme: "sage" } };
const routes = { session, notes: { notes: [] }, events: { events: [] }, courses: { courses: [] } };
const SET = "src/features/settings.tsx → Settings";
const ui = (at = "/settings", width?: number) => { stubApi(routes); return mount(<MemoryRouter initialEntries={[at]}><Provider><App /></Provider></MemoryRouter>, width ? { width } : {}); };
const body = () => document.querySelector("main") ?? document.body;
const h2s = () => [...body().querySelectorAll("h2")].map((h) => h.textContent);
const nav = () => document.querySelector('nav[aria-label="Settings sections"]');
const buttons = (root: Element) => [...root.querySelectorAll("button")].map((b) => b.textContent);

await test("1. Each section does not open on its own page: Account with Delete account last, then Appearance, then Data", SET, async () => {
  const known = (t: string | null) => ["Account", "Appearance", "Data", "Delete account"].includes(t!);
  ui();
  await waitFor(() => nav());
  expect(h2s().filter(known)).toEqual(["Account", "Delete account"]);
  for (const [section, heading] of [["appearance", "Appearance"], ["data", "Data"]]) {
    ui(`/settings?section=${section}`);
    await waitFor(() => body().querySelector(`#${section}-section`));
    expect(h2s().filter(known)).toEqual([heading]);
  }
});
await test("2. The section list has more or fewer than Account, Appearance, Data, or marks none as current", SET + " (nav)", async () => {
  ui();
  const list = await waitFor(() => nav());
  expect([...list.querySelectorAll("a")].map((a) => [a.querySelector("strong")!.textContent, a.getAttribute("aria-current")])).toEqual([["Account", "true"], ["Appearance", null], ["Data", null]]);
});
await test("3. ?section=data does not open Data, and clicking Appearance does not mark it", SET + " (section from the address)", async () => {
  ui("/settings?section=data");
  const list = await waitFor(() => nav());
  expect(list.querySelector('[aria-current="true"] strong')!.textContent).toBe("Data");
  await click([...list.querySelectorAll("a")].find((a) => a.querySelector("strong")!.textContent === "Appearance") as HTMLElement);
  await waitFor(() => list.querySelector('[aria-current="true"] strong')!.textContent === "Appearance");
});
await test("4. Delete account is not on the Account page below its list of actions, or is still inside that list", "src/features/account.tsx → AccountSettings (danger)", async () => {
  ui();
  await waitFor(() => nav());
  const account = body().querySelector('[aria-labelledby="account-heading"]')!;
  const del = byRole("button", "Delete account")!;
  expect([account.contains(del), !!(account.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING), body().querySelector('[aria-labelledby="data-heading"]')]).toEqual([false, true, null]);
  expect(buttons(account)).toEqual(["Change photo", "Edit account", "Change password", "Replace recovery code"]);
});
await test("5. Sign out or a course list is still on Settings", "src/features/account.tsx → AccountSettings, src/features/settings.tsx", async () => {
  ui();
  await waitFor(() => nav());
  const text = body().textContent!;
  const exact = (re: RegExp) => [...body().querySelectorAll("button, a, strong")].some((e) => re.test(e.textContent!));
  expect([exact(/^sign out$/i), exact(/^log out$/i), /courses?\b(?!,)/i.test(text.replace("Notes, courses, and events", "")), /prototype|sample workspace/i.test(text)]).toEqual([false, false, false, false]);
});
await test("6. Appearance lost the Mode, Color scheme or Your themes groups", "src/features/settings.tsx → Appearance", async () => {
  ui("/settings?section=appearance");
  await waitFor(() => nav());
  const legends = [...body().querySelectorAll("fieldset legend")].map((l) => l.textContent);
  expect(legends).toEqual(["Mode", "Color scheme", "Your themes"]);
});
await test("7. Clear workspace does not open \"Start fresh?\", or the Data line is missing", SET + " (Data)", async () => {
  ui("/settings?section=data");
  await waitFor(() => nav());
  expect(body().textContent!.includes("Notes, courses, and events are saved to your account.")).toBe(true);
  await click(byRole("button", "Clear workspace"));
  const dialog = await waitFor(() => document.querySelector('[role="dialog"]'));
  expect(dialog.querySelector("h2, [id]")?.textContent).toContain("Start fresh?");
});
await test("8. Settings scrolls sideways at 320 px", "src/features/settings.module.css", async () => {
  ui("/settings", 320);
  await waitFor(() => document.querySelector("iframe")!.contentDocument!.querySelector('nav[aria-label="Settings sections"]'));
  expect(pageScrollWidth() <= 320).toBe(true);
});
