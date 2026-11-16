import { AccountSettings } from "./account";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "../app/context";
import { Modal, PageHeading } from "../shared/ui";
import s from "../shared/ui.module.css";
import a from "./appearance.module.css";
import l from "./settings.module.css";
import type { ColorScheme, ThemeMode } from "../domain";

const MODES: [ThemeMode, string][] = [["system", "System"], ["light", "Light"], ["dark", "Dark"]];
// Preview colors: bg, surface, primary of each scheme in light mode (the same values as tokens.css).
const SCHEMES: [ColorScheme, string, string[]][] = [
  ["sage", "Sage", ["#f8f9f6", "#fff", "#8b5d33"]],
  ["fjord", "Fjord", ["#eceff4", "#f8f9fb", "#496a92"]],
  ["rose", "Rosé", ["#faf4ed", "#fffaf3", "#286983"]],
  ["mocha", "Mocha", ["#eff1f5", "#fff", "#7a2fd6"]],
];

// Native radios give the arrow-key and Tab behavior of a radio group.
const SECTIONS = [["account", "Account"], ["appearance", "Appearance"], ["data", "Data"]] as const;

function Appearance() {
  const { state, setPreferences } = useApp();
  const [failed, setFailed] = useState(false);
  const current = state.preferences;
  async function choose(next: typeof current) {
    setFailed(false);
    if (!(await setPreferences(next))) setFailed(true);
  }
  return (
    <>
      <fieldset className={a.group}>
        <legend>Mode</legend>
        <div className={a.options}>
          {MODES.map(([key, label]) => (
            <label key={key} className={a.option}>
              <input type="radio" name="mode" checked={current.mode === key} onChange={() => choose({ ...current, mode: key })} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={a.group}>
        <legend>Color scheme</legend>
        <div className={a.options}>
          {SCHEMES.map(([key, label, colors]) => (
            <label key={key} className={a.option}>
              <input type="radio" name="scheme" checked={current.scheme === key} onChange={() => choose({ ...current, scheme: key })} />
              <span className={a.swatch} aria-hidden="true">{colors.map((c) => <span key={c} style={{ background: c }} />)}</span>
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {failed && <p className={a.alert} role="alert">Your appearance could not be saved. Please try again.</p>}
    </>
  );
}
export function Settings() {
  const { state, repo, refresh } = useApp();
  const [reset, setReset] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const clearing = useRef(false); // set at once, so a double click cannot send a second request
  const [params] = useSearchParams();
  const asked = params.get("section");
  const current = SECTIONS.find(([key]) => key === asked)?.[0] ?? "account";
  // Scroll to the section named in the address (not on first load of the default).
  useEffect(() => { if (asked) document.getElementById(`${current}-section`)?.scrollIntoView?.({ block: "start" }); }, [asked, current]);
  return (
    <>
      <PageHeading
        eyebrow="Just the way you like it"
        title="Settings"
        description="Manage your account, appearance, and data."
      />
      <div className={l.layout}>
      <nav className={l.nav} aria-label="Settings sections">
        {SECTIONS.map(([key, label]) => (
          <Link key={key} to={`/settings?section=${key}`} aria-current={current === key ? "true" : undefined}>{label}</Link>
        ))}
      </nav>
      <div className={l.sections}>
        <div id="account-section" className={l.section}><AccountSettings /></div>
        <section id="appearance-section" className={`${s.panel} ${l.section}`} aria-labelledby="appearance-heading">
          <div className={s.settingsHeading}>
            <h2 id="appearance-heading">Appearance</h2>
            <p className={s.muted}>Choose a theme, or follow your device.</p>
          </div>
          <Appearance />
        </section>
        <section id="data-section" className={`${s.panel} ${l.section}`} aria-labelledby="data-heading">
          <div className={s.settingsHeading}>
            <h2 id="data-heading">Data</h2>
            <p className={s.muted}>
              Notes, courses, and events are saved to your account.
            </p>
          </div>
          <ul className={s.settingRows}>
            <li>
              <span>
                <strong>Clear workspace</strong>
                <small>
                  Remove every note, course, and event from your account.
                </small>
              </span>
              <button className={s.secondary} onClick={() => { setError(""); setConfirmText(""); setReset(true); }}>
                Clear workspace
              </button>
            </li>
          </ul>
          {error && !reset && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
        </section>
        <AccountSettings danger />
      </div>
      </div>
      {reset && (
        <Modal
          title="Start fresh?"
          description="This permanently deletes your notes, courses and events from your account. It cannot be undone."
          dismissible={!busy}
          onClose={() => setReset(false)}
        >
          {(
            <label className={l.confirmField}>
              Type CLEAR to confirm
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
          )}
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
          <button
            className={s.danger}
            disabled={busy || (confirmText !== "CLEAR")}
            onClick={async () => {
              if (clearing.current) return;
              clearing.current = true;
              setBusy(true);
              setError("");
              try {
                await repo.reset();
                setReset(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                clearing.current = false;
                setBusy(false);
                await refresh().catch(() => undefined);
              }
            }}
          >
            {busy ? "Clearing…" : "Clear workspace"}
          </button>
        </Modal>
      )}
    </>
  );
}
