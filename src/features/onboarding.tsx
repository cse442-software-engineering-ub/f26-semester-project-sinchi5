import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen } from "lucide-react";
import { useApp } from "../app/context";
import { FieldError, PasswordRequirements, RecoveryCode } from "./account";
import { PASSWORD_MIN, emailError, nameError, passwordCharacterError, passwordError, recoveryCodeError } from "../services/validation";
import { BRAND } from "../domain";
import s from "../shared/ui.module.css";
import o from "./onboarding.module.css";
// Shared classes this screen's own rules also name (see onboarding.module.css), applied together.
const both = { eyebrow: `${s.eyebrow} ${o.eyebrow}`, form: `${s.form} ${o.form}`, muted: `${s.muted} ${o.muted}`, primary: `${s.primary} ${o.primary}`, textLink: `${s.textLink} ${o.textLink}` };
export function Onboarding() {
  const { state, repo, refresh } = useApp();
  const navigate = useNavigate();
  // Card 258: App sends visitors here with this flag when a session ended or an app page was opened signed out.
  const loginRequired = useLocation().state?.loginRequired === true;
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [confirmation, setConfirmation] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const fieldErrors = {
    name: mode === "signup" ? nameError(name) : "",
    email: emailError(email),
    recovery: mode === "recover" ? recoveryCodeError(recoveryInput) : "",
    password: mode === "signin" ? (password ? "" : "Enter your password.") : passwordError(password),
  };
  const shown = (field: keyof typeof fieldErrors) => {
    const message = (submitted || touched[field]) ? fieldErrors[field] : "";
    // The requirements list already explains character problems in new passwords.
    return field === "password" && mode !== "signin" && passwordCharacterError(password) ? "" : message;
  };
  const touch = (field: string) => () => setTouched(t => ({ ...t, [field]: true }));
  const invalidProps = (field: keyof typeof fieldErrors, describedBy?: string) => ({
    "aria-invalid": Boolean((submitted || touched[field]) && fieldErrors[field]) || undefined,
    "aria-describedby": [shown(field) ? `${field}-error` : "", describedBy].filter(Boolean).join(" ") || undefined,
    onBlur: touch(field),
  });
  async function enter() {
    if (pending.current) return;
    setError(""); setMessage("");
    const first = (Object.keys(fieldErrors) as (keyof typeof fieldErrors)[]).find(f => fieldErrors[f]);
    if (first) {
      setSubmitted(true);
      document.getElementById(`${first}-input`)?.focus();
      return;
    }
    if (mode !== "signin" && password !== confirmation) { setError("Passwords do not match."); return; }
    pending.current = true;
    setBusy(true);
    try {
      if (mode === "signup") {
        const result = await repo.auth.signUp(name, email, password);
        setRecoveryCode(result.recoveryCode);
        // Keeps this screen up until Continue, even though the new account is already signed in.
        navigate("/welcome", { replace: true, state: { newAccount: true } });
      } else if (mode === "recover") {
        setRecoveryCode(await repo.auth.resetPassword(email, recoveryInput, password));
      } else {
        await repo.auth.signIn(email, password);
        // An account left mid-setup is finished in the background by App.
        navigate("/welcome", { replace: true });
      }
      setPassword(""); setConfirmation(""); setRecoveryInput("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function changeMode(next: string) {
    setMode(next); setError(""); setMessage(""); setPassword(""); setConfirmation(""); setRecoveryInput("");
    setTouched({}); setSubmitted(false);
  }
  return (
    <div className={o.onboarding}>
      <aside className={o.onboardingArt}>
        <LinkLogo />
        <div>
          <span className={both.eyebrow}>Less scattered. More connected.</span>
          <h1>
            A little more organized.
            <br />
            <em>A lot more headspace.</em>
          </h1>
          <p>
            Your notes, your classes, your next big idea.
            <br />
            Give them a place to come together.
          </p>
          <div className={o.paperStack} aria-hidden="true">
            <div />
            <div />
            <article>
              <BookOpen size={28} />
              <span>NOTES TO SELF</span>
              <h3>
                Make room
                <br />
                for what matters.
              </h3>
              <i />
              <i />
              <i />
              <small>One thought at a time. ✧</small>
            </article>
          </div>
        </div>
        <small>Made for curious minds.</small>
      </aside>
      <main className={o.onboardingMain}>
        <div className={`${o.onboardingContent} ${o.enter}`}>
          {recoveryCode ? <RecoveryCode code={recoveryCode} onDone={async () => {
            if (pending.current) return;
            setError("");
            if (mode === "signup") {
              pending.current = true;
              try {
                await repo.auth.completeOnboarding();
                await refresh();
                setRecoveryCode("");
                navigate("/", { replace: true });
              } catch (e) { setError((e as Error).message); }
              finally { pending.current = false; }
            } else { setRecoveryCode(""); changeMode("signin"); setMessage("Password reset. Log in with your new password."); }
          }} /> : (
            <>
              <span className={both.eyebrow}>Your next chapter</span>
              <h2>
                {mode === "signup"
                  ? "A fresh start."
                  : mode === "recover" ? "Recover your account." : "Good to see you again."}
              </h2>
              {loginRequired && mode === "signin" && <p role="status">Log in to continue.</p>}
              <p className={both.muted}>
                A small step toward a more organized semester.
              </p>
                <form
                  className={both.form}
                  noValidate
                  aria-busy={busy}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void enter();
                  }}
                >
                  <fieldset className={s.accountFields} disabled={busy}>
                  {mode === "signup" && (<>
                    <label>
                      Your name
                      <input
                        id="name-input"
                        required
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="What should we call you?"
                        {...invalidProps("name")}
                      />
                    </label>
                    <FieldError id="name-error" message={shown("name")} />
                  </>)}
                  <label>
                    Email address
                    <input
                      id="email-input"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@university.edu"
                      {...invalidProps("email")}
                    />
                  </label>
                  <FieldError id="email-error" message={shown("email")} />
                  {mode === "recover" && <>
                    <label>Recovery code<input id="recovery-input" required autoComplete="off" spellCheck={false} value={recoveryInput} onChange={e => setRecoveryInput(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" {...invalidProps("recovery")} /></label>
                    <FieldError id="recovery-error" message={shown("recovery")} />
                  </>}
                  <label>
                    {mode === "recover" ? "New password" : "Password"}
                    <input
                      id="password-input"
                      type="password"
                      minLength={mode === "signin" ? undefined : PASSWORD_MIN}
                      {...invalidProps("password", mode === "signin" ? undefined : "signup-password-help")}
                      required
                      autoComplete={
                        mode === "signin" ? "current-password" : "new-password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "signin" ? "Your password" : `At least ${PASSWORD_MIN} characters`}
                    />
                  </label>
                  <FieldError id="password-error" message={shown("password")} />
                  {mode !== "signin" && <>
                    <label>Confirm password<input type="password" required autoComplete="new-password" aria-describedby="signup-password-help" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
                    <PasswordRequirements id="signup-password-help" password={password} confirmation={confirmation} />
                  </>}
                  {mode === "recover" && <p className={both.muted}>Enter the code you saved at signup. A successful reset logs out all sessions and gives you a replacement code.</p>}
                  <button disabled={busy} className={both.primary}>
                    {busy
                      ? "Opening your space…"
                      : mode === "signup"
                        ? "Create account"
                        : mode === "recover" ? "Reset password" : "Log in"}{" "}
                    <ArrowRight size={16} />
                  </button>
                  {mode === "signin" && <button type="button" className={both.textLink} onClick={() => changeMode("recover")}>Forgot password?</button>}
                  {mode === "signin" ? (
                    <p className={o.switch}>
                      New to Notely?{" "}
                      <button type="button" className={both.textLink} onClick={() => changeMode("signup")}>Create account</button>
                    </p>
                  ) : (
                    <button type="button" className={both.textLink} onClick={() => changeMode("signin")}>
                      Already have an account? Log in
                    </button>
                  )}
                  </fieldset>
                </form>
            </>
          )}
          {message && <p role="status">{message}</p>}
          {(error || state.error) && (
            <p role="alert" className={s.error}>
              {error || state.error}
            </p>
          )}
          {state.user && !recoveryCode && <button className={both.textLink} disabled={busy} onClick={async () => {
            try { await repo.auth.signOut(); changeMode("signin"); await refresh(); }
            catch (e) { setError((e as Error).message); }
          }}>Log out</button>}
        </div>
        <footer>Made for your mind. Designed for your day.</footer>
      </main>
    </div>
  );
}
function LinkLogo() {
  return (
    <div className={o.logo}>
      <span>
        <BookOpen size={23} />
      </span>
      {BRAND}
      <i>✦</i>
    </div>
  );
}
