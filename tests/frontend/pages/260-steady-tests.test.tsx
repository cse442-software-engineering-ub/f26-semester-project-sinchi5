// Frontend test: card 260, the test harness itself stays steady between cases (no real screen; it checks the shared helpers).
import { useEffect } from "react";
import { page, test, expect } from "../../shared/runner.js";
import { mount, unmount, waitFor } from "../harness";

page({ card: "260", title: "Frontend: Steady test pages", kind: "frontend" });

const HARNESS = "tests/frontend/harness.tsx → unmount, mount";
const frames = () => document.querySelectorAll("iframe").length;
const hello = <p>hello</p>;

await test("1. A phone-width mount leaves its iframe behind when the next mount or unmount happens", HARNESS, async () => {
  mount(hello, { width: 320 });
  mount(hello, { width: 375 });
  expect(frames()).toBe(1);
  unmount();
  expect(frames()).toBe(0);
});
await test("2. The previous case's iframe is still on the page at the start of this case", HARNESS + " (hooks.before)", async () => {
  mount(hello, { width: 320 }); // left up on purpose; the next case must start clean
  expect(frames()).toBe(1);
});
await test("3. The case before this one left an iframe, or mounting the same screen twice gives a different result", HARNESS, async () => {
  expect(frames()).toBe(0);
  const first = mount(hello).innerHTML;
  await waitFor(() => document.body.textContent?.includes("hello"));
  const second = mount(hello).innerHTML;
  await waitFor(() => document.body.textContent?.includes("hello"));
  expect([first, second]).toEqual([first, first]);
});
await test("4. A timer a screen starts is still running after the screen is closed", HARNESS, async () => {
  const live = new Set<number>();
  const [si, ci] = [window.setInterval, window.clearInterval];
  window.setInterval = ((f: TimerHandler, ms?: number) => { const id = si(f, ms); live.add(id); return id; }) as typeof si;
  window.clearInterval = ((id?: number) => { live.delete(id as number); ci(id); }) as typeof ci;
  try {
    const Ticker = () => { useEffect(() => { const t = setInterval(() => {}, 30000); return () => clearInterval(t); }, []); return hello; };
    mount(<Ticker />);
    await waitFor(() => live.size === 1);
    unmount();
    expect(live.size).toBe(0);
  } finally { window.setInterval = si; window.clearInterval = ci; }
});
await test("5. The test index does not list every frontend page file", "scripts/copy-tests.mjs → list (dist/tests/pages.json)", async () => {
  const files = Object.keys(import.meta.glob("./*.html")).map((f) => f.replace("./", ""));
  const listed: { href: string }[] = (await (await fetch(new URL("../../pages.json", location.href))).json()).frontend;
  expect(files.filter((f) => !listed.some((p) => p.href.endsWith("/" + f)))).toEqual([]);
});
