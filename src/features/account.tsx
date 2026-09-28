import { useRef, useState, type FormEvent } from "react";
import { useApp } from "../app/context";
import { Modal } from "../shared/ui";
import s from "../app/App.module.css";

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
      setAction(undefined);
      setMessage(action === "password" ? "Password changed. Other sessions have been signed out." : action === "profile" ? "Account details saved." : "");
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className={s.panel}>
    <h2>Your account</h2><h3 className={s.accountText}>{state.user?.name}</h3><p className={`${s.muted} ${s.accountText}`}>{state.user?.email}</p>
    {isDemo ? <p className={s.muted}>You’re exploring a sample workspace. Sign out to create an account.</p> :
      <div className={s.actions}>
        <button className={s.secondary} onClick={() => { setError(""); setAction("profile"); }}>Edit account</button>
        <button className={s.secondary} onClick={() => { setError(""); setAction("password"); }}>Change password</button>
        <button className={s.secondary} onClick={() => { setError(""); setAction("recovery"); }}>Replace recovery code</button>
        <button className={s.secondary} onClick={() => { setError(""); setAction("delete"); }}>Delete account</button>
      </div>}
    <button className={s.secondary} disabled={busy} onClick={async () => {
      if (pending.current) return;
      pending.current = true; setBusy(true); setError("");
      try { await repo.auth.signOut(); await refresh(); }
      catch (e) { setError((e as Error).message); }
      finally { pending.current = false; setBusy(false); }
    }}>Sign out</button>
    {message && <p role="status">{message}</p>}
    {!action && error && <p className={s.error} role="alert">{error}</p>}
    {action && <Modal title={{ profile: "Edit account", password: "Change password", recovery: "Replace recovery code", delete: "Delete your account?" }[action]}
      dismissible={!busy} onClose={() => { if (!pending.current) { setAction(undefined); setError(""); } }}>
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
            <label>New password<input name="password" type="password" minLength={15} required autoComplete="new-password" aria-describedby="password-help" /></label>
            <small id="password-help">Use at least 15 characters, up to 72 bytes. Spaces are welcome.</small>
            <label>Confirm new password<input name="confirm" type="password" required autoComplete="new-password" /></label>
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
