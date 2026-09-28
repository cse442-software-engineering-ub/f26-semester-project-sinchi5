import { useRef, useState, type FormEvent } from "react";
import { Check, Circle } from "lucide-react";
import { useApp } from "../app/context";
import { Modal } from "../shared/ui";
import s from "../app/App.module.css";

export const PASSWORD_MIN = 8;
const passwordBytes = (value: string) => new TextEncoder().encode(value).length;

export function PasswordRequirements({ id, password, confirmation }: { id: string; password: string; confirmation?: string }) {
  const rules = [
    { label: `At least ${PASSWORD_MIN} characters`, met: [...password].length >= PASSWORD_MIN },
    ...(passwordBytes(password) > 72 ? [{ label: "Too long — use at most 72 bytes", met: false }] : []),
    ...(confirmation === undefined ? [] : [{ label: "Passwords match", met: password !== "" && password === confirmation }]),
  ];
  return <ul id={id} className={s.passwordRules} aria-live="polite">
    {rules.map(r => <li key={r.label} data-met={r.met}>
      {r.met ? <Check size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
      {r.label}<span className={s.srOnly}>{r.met ? " (met)" : " (not met)"}</span>
    </li>)}
  </ul>;
}

export function RecoveryCode({ code, onDone }: { code: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  return <section className={s.form} aria-label="Save your recovery code">
    <h2>Save your recovery code</h2>
    <p>Keep this code somewhere safe, such as a password manager. It is shown only once. You will need it if you forget your password.</p>
    <output className={s.recoveryCode} aria-label="Recovery code">{code}</output>
    <p className={s.muted}>A new code replaces any previous code. Without your password or this code, you cannot recover your account.</p>
    <label className={s.checkLabel}><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />I saved my recovery code</label>
    <button className={s.primary} disabled={!saved} onClick={onDone}>Continue</button>
  </section>;
}

export function AccountSettings() {
  const { state, repo, refresh } = useApp();
  const [action, setAction] = useState<"profile" | "password" | "recovery" | "delete">();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const isDemo = state.user?.id === "student";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending.current) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) || "");
    if (action === "password" && value("password") !== value("confirm")) { setError("Passwords do not match."); return; }
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (action === "profile") await repo.auth.updateProfile(value("name"), value("email"), value("currentPassword"));
      if (action === "password") await repo.auth.changePassword(value("currentPassword"), value("password"));
      if (action === "recovery") setCode(await repo.auth.replaceRecoveryCode(value("currentPassword")));
      if (action === "delete") await repo.auth.deleteAccount(value("currentPassword"));
      form.reset();
      setNewPassword(""); setConfirmPassword("");
      setAction(undefined);
      setMessage(action === "password" ? "Password changed. Other sessions have been signed out." : action === "profile" ? "Account details saved." : "");
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { pending.current = false; setBusy(false); }
  }
  const open = (next: NonNullable<typeof action>) => { setError(""); setMessage(""); setAction(next); };
  const initials = (state.user?.name || state.user?.email || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");
  return <section className={s.panel} aria-labelledby="account-heading">
    <div className={s.settingsHeading}>
      <h2 id="account-heading">Account</h2>
      <p className={s.muted}>Manage how you sign in and keep your account secure.</p>
    </div>
    <div className={s.accountSummary}>
      <span className={s.avatar} aria-hidden="true">{initials}</span>
      <span>
        <strong className={s.accountText}>{state.user?.name}</strong>
        <small className={`${s.muted} ${s.accountText}`}>{state.user?.email}</small>
      </span>
      {!isDemo && <button className={s.secondary} onClick={() => open("profile")}>Edit account</button>}
    </div>
    {isDemo && <p className={s.muted}>You’re exploring a sample workspace. Sign out to create an account.</p>}
    <ul className={s.settingRows}>
      {!isDemo && <>
        <li>
          <span><strong>Password</strong><small>Use at least {PASSWORD_MIN} characters. A passphrase is easiest to remember.</small></span>
          <button className={s.secondary} onClick={() => open("password")}>Change password</button>
        </li>
        <li>
          <span><strong>Recovery code</strong><small>Your only way back in if you forget your password.</small></span>
          <button className={s.secondary} onClick={() => open("recovery")}>Replace recovery code</button>
        </li>
      </>}
      <li>
        <span><strong>Sign out</strong><small>End your session in this browser.</small></span>
        <button className={s.secondary} disabled={busy} onClick={async () => {
          if (pending.current) return;
          pending.current = true; setBusy(true); setError("");
          try { await repo.auth.signOut(); await refresh(); }
          catch (e) { setError((e as Error).message); }
          finally { pending.current = false; setBusy(false); }
        }}>Sign out</button>
      </li>
      {!isDemo && <li className={s.dangerRow}>
        <span><strong>Delete account</strong><small>Permanently remove your account and sign out everywhere.</small></span>
        <button className={s.dangerOutline} onClick={() => open("delete")}>Delete account</button>
      </li>}
    </ul>
    {message && <p role="status">{message}</p>}
    {!action && error && <p className={s.error} role="alert">{error}</p>}
    {action && <Modal title={{ profile: "Edit account", password: "Change password", recovery: "Replace recovery code", delete: "Delete your account?" }[action]}
      dismissible={!busy} onClose={() => { if (!pending.current) { setAction(undefined); setError(""); setNewPassword(""); setConfirmPassword(""); } }}>
      <form className={s.form} onSubmit={submit}>
        <fieldset className={s.accountFields} disabled={busy}>
          {action === "profile" && <>
            <label>Your name<input name="name" autoComplete="name" defaultValue={state.user?.name} maxLength={100} required /></label>
            <label>Email address<input name="email" type="email" autoComplete="email" defaultValue={state.user?.email} maxLength={254} required /></label>
            <p className={s.muted}>Enter your current password to change your email address. This signs out your other sessions.</p>
          </>}
          {action === "delete" && <p>This permanently deletes your account and signs out every session. The sample workspace saved for this account in this browser will also be removed.</p>}
          {action === "recovery" && <p>Your previous recovery code will stop working. Save the replacement before leaving this screen.</p>}
          <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required={action !== "profile"} /></label>
          {action === "password" && <>
            <label>New password<input name="password" type="password" minLength={PASSWORD_MIN} required autoComplete="new-password" aria-describedby="password-help" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
            <label>Confirm new password<input name="confirm" type="password" required autoComplete="new-password" aria-describedby="password-help" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label>
            <PasswordRequirements id="password-help" password={newPassword} confirmation={confirmPassword} />
          </>}
          {action === "delete" && <label className={s.checkLabel}><input type="checkbox" required />I understand that deletion is permanent</label>}
          {error && <p className={s.error} role="alert">{error}</p>}
          <button className={action === "delete" ? s.danger : s.primary}>{busy ? "Saving…" : action === "delete" ? "Permanently delete account" : action === "recovery" ? "Generate replacement code" : "Save changes"}</button>
        </fieldset>
      </form>
    </Modal>}
    {code && <Modal title="Your new recovery code" dismissible={false} onClose={() => {}}><RecoveryCode code={code} onDone={() => setCode("")} /></Modal>}
  </section>;
}
