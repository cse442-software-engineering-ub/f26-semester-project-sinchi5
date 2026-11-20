import { AccountSettings } from "./account";
import { useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp, useHoldRefresh } from "../app/context";
import { Avatar, Modal, PageHeading } from "../shared/ui";
import s from "../shared/ui.module.css";
import a from "./appearance.module.css";
import l from "./settings.module.css";
import { buildPalette } from "../services/palette";
import type { ColorScheme, CustomTheme, Preferences, ThemeMode } from "../domain";

const MODES: [ThemeMode, string][] = [["system", "System"], ["light", "Light"], ["dark", "Dark"]];
// Preview colors: ground, sheet, ribbon of each scheme in light mode (the same values as tokens.css, card 251).
const SCHEMES: [ColorScheme, string, string[]][] = [
  ["sage", "Sage", ["#f2f4ee", "#ffffff", "#8b5d33"]],
  ["fjord", "Fjord", ["#ebeef3", "#fbfcfe", "#496a92"]],
  ["rose", "Rosé", ["#f7f0e8", "#fffaf3", "#286983"]],
  ["mocha", "Mocha", ["#eceef3", "#ffffff", "#7a2fd6"]],
];

// Native radios give the arrow-key and Tab behavior of a radio group.
const SECTIONS = [
  ["account", "Account", "Your name, photo, password and recovery code."],
  ["appearance", "Appearance", "Mode, color scheme and your own themes."],
  ["data", "Data", "What is saved to your account."],
] as const;

// A miniature planner sheet: ground, sheet, ribbon. The three spans carry the scheme's colors; the rules are decoration.
function Mini({ colors }: { colors: string[] }) {
  return (
    <span className={a.mini} aria-hidden="true">
      {colors.map((c, i) => <span key={i} className={[a.miniGround, a.miniSheet, a.miniRibbon][i]} style={{ background: c }}>{i === 1 && <><i /><i /><i /></>}</span>)}
    </span>
  );
}

const MAX_THEMES = 4;
const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);
// A new theme starts from the colors on screen now (the computed variables), so the preview matches what the student sees.
function startingColors() {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string) => {
    const v = css.getPropertyValue(name).trim();
    return /^#[0-9a-f]{3}$/i.test(v) ? `#${[...v.slice(1)].map((c) => c + c).join("")}` : v;
  };
  return { accent: read("--primary"), background: read("--bg"), text: read("--text") };
}
const swatchOf = (t: CustomTheme) => {
  const b = isHex(t.accent) && isHex(t.background) && isHex(t.text) ? buildPalette(t) : null;
  // Preview the mode the theme was made for: a dark background shows its dark set.
  const p = b && (b.dark["--bg"] === t.background.toLowerCase() ? b.dark : b.light);
  return p ? [p["--ground"], p["--sheet"], p["--ribbon"]] : [];
};

// The three-color form, with both results previewed from buildPalette as the colors change.
function ThemeEditor({ theme, onSaved, onCancel }: { theme: CustomTheme | null; onSaved: (saved: Preferences, id: string) => void; onCancel: () => void }) {
  const { state, saveTheme } = useApp();
  const [name, setName] = useState(theme?.name ?? "");
  const [colors, setColors] = useState(() => (theme ? { accent: theme.accent, background: theme.background, text: theme.text } : startingColors()));
  const [error, setError] = useState<{ field: "name" | "colors" | "form"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useHoldRefresh(true); // the editor is open
  const built = useMemo(() => (isHex(colors.accent) && isHex(colors.background) && isHex(colors.text) ? buildPalette(colors) : null), [colors]);
  const fieldError = (field: string) => (error?.field === field ? error.message : "");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const known = new Set((state.preferences.customThemes ?? []).map((t) => t.id));
      const saved = await saveTheme({ id: theme?.id, name, ...colors });
      const id = theme?.id ?? saved.customThemes?.find((t) => !known.has(t.id))?.id;
      if (id) onSaved(saved, id);
    } catch (err) {
      const message = (err as Error).message;
      setError({ field: /name/i.test(message) ? "name" : /color/i.test(message) ? "colors" : "form", message });
    } finally { setBusy(false); }
  }
  const color = (key: keyof typeof colors, label: string) => (
    <label className={a.colorField}>
      {label}
      <input type="color" value={colors[key]} onChange={(e) => setColors({ ...colors, [key]: e.target.value })} aria-describedby={error?.field === "colors" ? "theme-colors-error" : undefined} />
    </label>
  );
  return (
    <form className={a.editor} onSubmit={submit} aria-label={theme ? "Edit theme" : "New theme"} noValidate>
      <div className={a.editorFields}>
        <h3>{theme ? "Edit theme" : "New theme"}</h3>
        <label className={a.nameField}>
          Theme name
          <input value={name} maxLength={30} autoComplete="off" onChange={(e) => setName(e.target.value)}
            aria-invalid={fieldError("name") ? true : undefined} aria-describedby={fieldError("name") ? "theme-name-error" : undefined} />
        </label>
        {fieldError("name") && <p id="theme-name-error" className={a.fieldError} role="alert">{fieldError("name")}</p>}
        <div className={a.colorRow}>{color("accent", "Accent")}{color("background", "Background")}{color("text", "Text")}</div>
        {fieldError("colors") && <p id="theme-colors-error" className={a.fieldError} role="alert">{fieldError("colors")}</p>}
        {built?.adjusted && <p className={a.note} role="status">We nudged your text color a little so it stays easy to read on this background.</p>}
        {error?.field === "form" && <p className={a.fieldError} role="alert">{error.message}</p>}
        <div className={a.editorActions}>
          <button type="submit" className={s.primary} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" className={s.secondary} onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
      </div>
      <div className={a.preview} aria-label="Preview">
        {built && (["light", "dark"] as const).map((mode) => (
          <div key={mode} className={a.previewPane} style={built[mode] as unknown as CSSProperties} data-preview={mode}>
            <strong>{mode === "light" ? "Light" : "Dark"}</strong>
            <div className={a.previewCard}>
              <span>Notes for Biology</span>
              <small>Due Friday</small>
              <span className={a.previewButton}>Save</span>
            </div>
          </div>
        ))}
      </div>
    </form>
  );
}

function Appearance() {
  const { state, setPreferences, deleteTheme } = useApp();
  const [failed, setFailed] = useState(false);
  const [editor, setEditor] = useState<{ theme: CustomTheme | null } | null>(null);
  const [deleting, setDeleting] = useState<CustomTheme | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [busy, setBusy] = useState(false);
  const lastBuiltIn = useRef<ColorScheme>("sage");
  const current = state.preferences;
  const themes = current.customThemes ?? [];
  const full = themes.length >= MAX_THEMES;
  if (!current.scheme.startsWith("custom:")) lastBuiltIn.current = current.scheme as ColorScheme;
  async function choose(next: typeof current) {
    setFailed(false);
    if (!(await setPreferences(next))) setFailed(true);
  }
  return (
    <>
      <fieldset className={a.group}>
        <legend>Mode</legend>
        <div className={a.segmented}>
          {MODES.map(([key, label]) => (
            <label key={key} className={a.mode}>
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
              <Mini colors={colors} />
              <span className={a.optionName}>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={a.group}>
        <legend>Your themes</legend>
        {themes.length > 0 && (
          <div className={a.options}>
            {themes.map((t) => (
              <div key={t.id} className={a.themeItem}>
                <label className={a.option}>
                  <input type="radio" name="scheme" checked={current.scheme === `custom:${t.id}`} onChange={() => choose({ ...current, scheme: `custom:${t.id}` })} />
                  <Mini colors={swatchOf(t)} />
                  <span className={a.optionName}>{t.name}</span>
                </label>
                <div className={a.itemActions}>
                  <button type="button" className={s.secondary} aria-label={`Edit ${t.name}`} onClick={() => setEditor({ theme: t })}>Edit</button>
                  <button type="button" className={s.secondary} aria-label={`Delete ${t.name}`} onClick={() => { setDeleteError(""); setDeleting(t); }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {themes.length === 0 && !editor && <p className={s.muted}>Make your own color scheme from an accent, a background, and a text color.</p>}
        <div className={a.newRow}>
          <button type="button" className={s.secondary} disabled={full} aria-describedby={full ? "theme-limit" : undefined} onClick={() => setEditor({ theme: null })}>New theme</button>
          {full && <p id="theme-limit" className={s.muted}>You can save up to {MAX_THEMES} themes. Delete one to add another.</p>}
        </div>
        {editor && (
          <ThemeEditor
            key={editor.theme?.id ?? "new"}
            theme={editor.theme}
            onCancel={() => setEditor(null)}
            onSaved={(saved, id) => { setEditor(null); void choose({ ...saved, scheme: `custom:${id}` }); }}
          />
        )}
      </fieldset>
      {failed && <p className={a.alert} role="alert">Your appearance could not be saved. Please try again.</p>}
      {deleting && (
        <Modal title="Delete this theme?" description={`"${deleting.name}" will be removed from your account on every device.`} dismissible={!busy} onClose={() => setDeleting(null)}>
          {deleteError && <p className={s.error} role="alert">{deleteError}</p>}
          <button className={s.danger} disabled={busy} onClick={async () => {
            const gone = deleting;
            setBusy(true);
            try {
              const saved = await deleteTheme(gone.id);
              if (editor?.theme?.id === gone.id) setEditor(null);
              // The server falls back to Sage; the student gets the built-in scheme they had before instead.
              if (current.scheme === `custom:${gone.id}` && lastBuiltIn.current !== saved.scheme) await choose({ ...saved, scheme: lastBuiltIn.current });
              setDeleting(null);
            } catch (e) { setDeleteError((e as Error).message); }
            finally { setBusy(false); }
          }}>{busy ? "Deleting…" : "Delete"}</button>
          <button className={s.secondary} disabled={busy} onClick={() => setDeleting(null)}>Cancel</button>
        </Modal>
      )}
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
  const index = (
    <>
      <nav className={l.nav} aria-label="Settings sections">
        {SECTIONS.map(([key, label, about]) => (
          <Link key={key} to={`/settings?section=${key}`} aria-current={current === key ? "true" : undefined}>
            <strong>{label}</strong>
            <small>{about}</small>
          </Link>
        ))}
      </nav>
      {state.user && (
        <div className={l.who}>
          <Avatar user={state.user} version={state.photoVersion} alt="" />
          <span className={l.whoText}><strong>{state.user.name}</strong><small>{state.user.email}</small></span>
        </div>
      )}
    </>
  );
  const section = current === "account" ? (
    <div id="account-section" className={l.section}>
      <AccountSettings />
      <AccountSettings danger />
    </div>
  ) : current === "appearance" ? (
    <section id="appearance-section" className={l.section} aria-labelledby="appearance-heading">
      <div className={s.settingsHeading}>
        <h2 id="appearance-heading">Appearance</h2>
        <p className={s.muted}>Choose a theme, or follow your device.</p>
      </div>
      <Appearance />
    </section>
  ) : (
    <section id="data-section" className={l.section} aria-labelledby="data-heading">
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
  );
  return (
    <>
      <PageHeading
        eyebrow="Just the way you like it"
        title="Settings"
        description="Manage your account, appearance, and data."
      />
      <div className={l.wrap}>
        <div className={l.layout}>
          <div className={`${s.panel} ${l.index}`} data-page>{index}</div>
          <div className={s.sheet} data-page>{section}</div>
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
