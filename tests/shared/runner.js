// Test page runner: plain browser JS, no build, no dependency. Contract: devwork-ai/ORCHESTRATION.md 4.3.
// Pages import { page, test, expect, api, signIn, signOut, finish }. Backend pages call the real API.
const KINDS = {
  backend: "Backend test: real API, no screen code",
  frontend: "Frontend test: real screen code, API replaced",
};
const PASSWORD = "TestPassword2026!";
const results = { card: null, title: "", kind: "", rows: [], passed: 0, total: 0, done: false };
window.__results = results;

const $ = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || "", textContent: text ?? "" });
const json = (v) => (typeof v === "string" ? v : JSON.stringify(v));
let rowsEl, queue = Promise.resolve(), busy = 0, idleTimer, started = false;

function ensureDom() {
  if (rowsEl) return;
  const report = $("div"); report.id = "report";
  rowsEl = $("div"); rowsEl.id = "rows";
  report.append(rowsEl);
  document.body.append(report);
}

export function page({ card, title, kind = "backend" }) {
  Object.assign(results, { card, title, kind, host: location.host });
  document.title = `${card} ${title}`;
  ensureDom();
  const build = $("p", "meta", "Build: unknown");
  document.getElementById("report").prepend($("h1", "", `${card} ${title}`), $("p", "meta", KINDS[kind] ?? KINDS.backend), $("p", "meta", `Server: ${location.host}`), build);
  fetch(new URL("../../build.json", location.href)).then((r) => r.json()).then((b) => { if (b.commit) build.textContent = `Build: ${b.commit}`; }).catch(() => {});
  poke();
}

// shortcut: the result line prints once nothing has run for 500 ms; a page with slow work after its last
// test() should call finish() itself, or keep calling api() (which counts as activity).
function poke() {
  clearTimeout(idleTimer);
  if (started && !busy) idleTimer = setTimeout(finish, 500);
}

export function finish() {
  if (results.done) return;
  results.done = true;
  results.total = results.rows.length;
  results.passed = results.rows.filter((r) => r.pass).length;
  const line = `Result: ${results.passed} of ${results.total} passed`;
  const el = $("p", "", line);
  el.id = "result";
  Object.assign(el.dataset, { passed: results.passed, total: results.total, done: "true" });
  document.getElementById("report").append(el);
  results.line = line;
}

function record(label, lookAt, pass, message) {
  ensureDom();
  results.rows.push({ label, pass, message: message ?? "", lookAt });
  rowsEl.append($("div", `row ${pass ? "pass" : "fail"}`, pass ? `PASS  ${label}` : `FAIL  ${label} — ${message}`));
  if (!pass) rowsEl.append($("div", "hint", `If this fails, look at: ${lookAt}`));
}

// Cases run in the order test() is called, one at a time. A thrown error fails that case; the run continues.
export function test(label, lookAt, fn) {
  started = true; busy++; clearTimeout(idleTimer);
  queue = queue.then(async () => {
    try { await fn(); record(label, lookAt, true); }
    catch (e) { record(label, lookAt, false, e?.expectation ?? `threw ${e?.message ?? e}`); }
    finally { busy--; poke(); }
  });
  return queue;
}

window.addEventListener("error", (e) => crash(e.message));
window.addEventListener("unhandledrejection", (e) => crash(e.reason?.message ?? e.reason));
function crash(msg) { started = true; record("page setup", "the test page's own code (it threw outside a test)", false, `threw ${msg}`); poke(); }

const fail = (want, got) => Object.assign(new Error("expectation"), { expectation: `expected ${want}, got ${got}` });
function same(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
}

// expect(x).toBe(y), .toEqual(y) (deep), .toContain(s); expect(response).toEqual(status, body) checks both.
export function expect(actual) {
  return {
    toBe(want) { if (actual !== want) throw fail(json(want), json(actual)); },
    toEqual(want, body) {
      if (arguments.length === 2) {
        if (actual?.status !== want || !same(actual.body, body)) throw fail(`${want} ${json(body)}`, `${actual?.status} ${json(actual?.body)}`);
      } else if (!same(actual, want)) throw fail(json(want), json(actual));
    },
    toContain(part) { if (!json(actual).includes(part)) throw fail(`to contain ${json(part)}`, json(actual)); },
  };
}

// Pages live at tests/<kind>/pages/, so the API is three levels up.
const API = new URL("../../../api/index.php", location.href).href;

// One request to the real API. The CSRF token comes from route=session on every POST (it changes at log in/out).
async function send(method, route, text, { query = "", csrf = true, contentType = "application/json" } = {}) {
  busy++; clearTimeout(idleTimer);
  try {
    const q = typeof query === "string" ? query : "&" + new URLSearchParams(query);
    const headers = {};
    if (method === "POST") {
      headers["Content-Type"] = contentType;
      if (csrf) headers["X-CSRF-Token"] = (await (await fetch(`${API}?route=session`, { credentials: "same-origin" })).json()).csrfToken;
    }
    const r = await fetch(`${API}?route=${encodeURIComponent(route)}${q}`, { method, headers, body: method === "POST" ? text : undefined, credentials: "same-origin" });
    const raw = await r.text();
    let body; try { body = JSON.parse(raw); } catch { body = raw; }
    return { status: r.status, body };
  } finally { busy--; poke(); }
}
// api("friends") is a GET; api("friend-request", {email}) is a POST. query: "&id=3" or {id: 3}.
export const api = (route, body, query) => send(body === undefined ? "GET" : "POST", route, body === undefined ? undefined : JSON.stringify(body), { query });
// api.raw("GET", "login") sends a wrong method; api.raw("POST", "login", bigText, {csrf:false}) a hand-made body.
api.raw = (method, route, text, opts) => send(method, route, text, opts);

export async function signOut() {
  const r = await api("logout", {});
  if (r.status !== 200) throw new Error(`log out answered ${r.status} ${json(r.body)}`);
}

// Logs in as `email` (switching accounts if someone else is signed in); registers only if the log in fails.
export async function signIn(email, password = PASSWORD) {
  const s = (await api("session")).body;
  if (s.user?.email === email.toLowerCase()) return s.user;
  if (s.user) await signOut();
  let r = await api("login", { email, password });
  if (r.status === 401) r = await api("register", { name: "Notely Tester", email, password });
  if (r.status !== 200 && r.status !== 201) throw new Error(`could not sign in as ${email}: ${r.status} ${json(r.body)}`);
  return r.body.user;
}
