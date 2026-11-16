import "../../src/app/tokens.css"; // every test page needs the color variables the app loads in main.tsx
// Frontend test harness: real screen code, API replaced. No dependency beyond React, which the app already uses.
// Pages import { page, test, expect } from "../../shared/runner.js" and the helpers below from "../harness".
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { hooks } from "../shared/runner.js";

type Answer = unknown | { status: number; body?: unknown; delay?: number };
type Sent = { route: string; method: string; body: any; csrf: string | null };
type Api = { sent: Sent[]; unexpected: string[] };

const realFetch = window.fetch.bind(window);
let current: Api | null = null;
let mounted: { root: Root; el: HTMLElement } | null = null;
let scope: Document = document;

const isSpec = (a: any) => a && typeof a === "object" && "status" in a && "body" in a;
const text = (e: Element | null) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
const same = (name: string, want: string | RegExp) => (typeof want === "string" ? name === want : want.test(name));

// Replaces fetch before the app renders. Each answer is the JSON body (status 200), {status, body, delay}, or a
// function of the request returning either. Every request is recorded in .sent; a route that is not scripted is
// recorded in .unexpected and refused, and the case then fails with "Unexpected request: route=…".
export function stubApi(answers: Record<string, Answer | ((req: Sent) => Answer)>): Api {
  const api: Api = { sent: [], unexpected: [] };
  current = api;
  window.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
    const route = url.searchParams.get("route") ?? url.pathname;
    const headers = new Headers(init.headers);
    let body: any = undefined;
    try { body = init.body ? JSON.parse(String(init.body)) : undefined; } catch { body = String(init.body); }
    const req: Sent = { route, method: init.method ?? "GET", body, csrf: headers.get("X-CSRF-Token") };
    api.sent.push(req);
    if (!(route in answers)) {
      api.unexpected.push(route);
      throw new TypeError(`Unexpected request: route=${route}`);
    }
    let answer: any = answers[route];
    if (typeof answer === "function") answer = answer(req);
    const spec = isSpec(answer) ? answer : { status: 200, body: answer };
    if (spec.delay) await new Promise((r) => setTimeout(r, spec.delay));
    return new Response(spec.body === undefined ? "" : JSON.stringify(spec.body), { status: spec.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return api;
}

function unmount() {
  mounted?.root.unmount();
  mounted?.el.closest("iframe")?.remove();
  mounted?.el.remove();
  mounted = null; scope = document;
}

// Mounts the element below the result row. { width } puts it in an iframe that wide, so media queries behave as on a phone.
export function mount(ui: ReactElement, { width }: { width?: number } = {}) {
  unmount();
  let el: HTMLElement;
  if (width) {
    const frame = document.createElement("iframe");
    frame.style.cssText = `width:${width}px;height:700px;border:1px solid gray;display:block`;
    document.body.append(frame);
    const doc = frame.contentDocument!;
    for (const n of document.head.querySelectorAll("link[rel=stylesheet], style")) doc.head.append(n.cloneNode(true));
    doc.body.style.margin = "0";
    el = doc.createElement("div");
    doc.body.append(el);
    scope = doc;
  } else {
    el = document.createElement("div");
    document.body.append(el);
  }
  const root = createRoot(el);
  root.render(ui);
  mounted = { root, el };
  return el;
}

// Every case starts from a fresh browser, a real fetch and nothing mounted; a failing case leaves its screen up until the next one starts.
hooks.before.push(() => { unmount(); window.fetch = realFetch; current = null; localStorage.clear(); sessionStorage.clear(); });
hooks.after.push(() => {
  window.fetch = realFetch;
  if (current?.unexpected.length) {
    const message = `Unexpected request: ${current.unexpected.map((r) => `route=${r}`).join(", ")}`;
    throw Object.assign(new Error(message), { expectation: message });
  }
});

const all = (sel: string) => [...scope.querySelectorAll(sel)].filter((e) => !e.closest("#report"));

function nameOf(e: Element): string {
  const aria = e.getAttribute("aria-label");
  if (aria) return aria.trim();
  const by = e.getAttribute("aria-labelledby");
  if (by) return by.split(/\s+/).map((id) => text(scope.getElementById(id))).join(" ").trim();
  if (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement) {
    const label = e.closest("label") ?? (e.id ? scope.querySelector(`label[for="${e.id}"]`) : null);
    if (label) { const c = label.cloneNode(true) as Element; c.querySelectorAll("input,textarea,select").forEach((n) => n.remove()); return text(c); }
    return e.getAttribute("placeholder") ?? "";
  }
  return text(e);
}

const ROLES: Record<string, string> = {
  button: "button, input[type=button], input[type=submit], [role=button]",
  link: "a[href], [role=link]",
  heading: "h1, h2, h3, h4, h5, h6, [role=heading]",
  textbox: "textarea, input:not([type]), input[type=text], input[type=email], input[type=search], input[type=url], input[type=tel], [role=textbox]",
  checkbox: "input[type=checkbox], [role=checkbox]",
  alert: "[role=alert]",
  dialog: "dialog, [role=dialog]",
  status: "[role=status]",
  list: "ul, ol, [role=list]",
  listitem: "li, [role=listitem]",
};

// byRole("button", "Log in"): the first element with that role (and accessible name, exact text or RegExp), or null.
export function byRole(role: string, name?: string | RegExp): HTMLElement | null {
  const found = all(ROLES[role] ?? `[role=${role}]`).filter((e) => name === undefined || same(nameOf(e), name));
  return (found[0] as HTMLElement) ?? null;
}
// byLabel("Password"): the form control whose label text is exactly that (also password boxes, which have no textbox role).
export function byLabel(label: string | RegExp): HTMLInputElement | null {
  return (all("input, textarea, select").find((e) => same(nameOf(e), label)) as HTMLInputElement) ?? null;
}
// byText("Request sent."): the innermost element whose whole text is exactly that (or matches the RegExp).
export function byText(want: string | RegExp): HTMLElement | null {
  const hits = all("*").filter((e) => same(text(e), want));
  return (hits.find((e) => !hits.some((o) => o !== e && e.contains(o))) as HTMLElement) ?? null;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
function need<T extends Element>(el: T | null, what: string): T {
  if (!el) throw new Error(`${what}: element not found on the screen`);
  return el;
}
export async function click(el: HTMLElement | null) {
  need(el, "click").click();
  await tick();
}
// Types like a person: focus, then set the value so React sees an input event (replaces what was there).
export async function type(el: HTMLElement | null, value: string) {
  const input = need(el, "type") as HTMLInputElement;
  input.focus();
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
}
// press(el, "Enter") in a field submits its form the way the browser's implicit submission does (default button click).
// shortcut: this is synthetic; it proves the form has a submit path, not that real Tab order is right (laptop gate's Playwright covers that).
export async function press(el: HTMLElement | null, key: string) {
  const target = need(el, "press");
  target.focus();
  const down = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  if (target.dispatchEvent(down) && key === "Enter" && target instanceof HTMLInputElement && target.form) {
    const submit = target.form.querySelector<HTMLElement>("button:not([type=button]):not([type=reset]), input[type=submit]");
    if (submit) submit.click(); else target.form.requestSubmit();
  }
  await tick();
}
// waitFor(() => byText("Done")): polls until the function returns something truthy (and does not throw); returns it.
export async function waitFor<T>(fn: () => T, timeout = 3000): Promise<NonNullable<T>> {
  const end = Date.now() + timeout;
  let last: unknown;
  for (;;) {
    try { const v = fn(); if (v) return v as NonNullable<T>; } catch (e) { last = e; }
    if (Date.now() > end) throw new Error(`waitFor timed out after ${timeout} ms${last ? `: ${(last as Error).message}` : ""}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}
// Width of the page the screen is in (the iframe's document when mounted with { width }).
export const pageScrollWidth = () => scope.documentElement.scrollWidth;
