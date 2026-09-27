import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Check } from "lucide-react";
import { BRAND } from "../domain";
import s from "../app/App.module.css";
type Account = { id: number; name: string; email: string };
async function postJson(url: string, body: unknown): Promise<Account> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
export function InvestorDemo() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [created, setCreated] = useState<Account>();
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [confirmed, setConfirmed] = useState<Account>();
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  async function createAccount() {
    setCreating(true);
    setCreateError("");
    setCreated(undefined);
    try {
      const account = await postJson("/api/v1/auth/register.php", {
        name,
        email,
        password,
      });
      setCreated(account);
      setLoginEmail(email);
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }
  async function confirmLogin() {
    setLoggingIn(true);
    setLoginError("");
    setConfirmed(undefined);
    try {
      const account = await postJson("/api/v1/auth/login.php", {
        email: loginEmail,
        password: loginPassword,
      });
      setConfirmed(account);
    } catch (e) {
      setLoginError((e as Error).message);
    } finally {
      setLoggingIn(false);
    }
  }
  return (
    <div className={s.onboarding}>
      <aside className={s.onboardingArt}>
        <div className={s.logo}>
          <span>
            <BookOpen size={23} />
          </span>
          {BRAND}
          <i>✦</i>
        </div>
        <div>
          <span className={s.eyebrow}>Investor proof of concept</span>
          <h1>
            A real account.
            <br />
            <em>Stored for real.</em>
          </h1>
          <p>
            This page calls a live PHP + MySQL backend, separate from
            <br />
            the browser-only prototype the rest of {BRAND} uses today.
          </p>
        </div>
        <small>
          <Link className={s.textLink} to="/welcome">
            Back to {BRAND}
          </Link>
        </small>
      </aside>
      <main className={s.onboardingMain}>
        <div className={s.onboardingContent}>
          <span className={s.eyebrow}>Step 1 · Create an account</span>
          <h2>Create a real account.</h2>
          <p className={s.muted}>
            Submitting this calls /api/v1/auth/register.php, which inserts a
            row into the users table in MySQL.
          </p>
          <form
            className={s.form}
            onSubmit={(e) => {
              e.preventDefault();
              void createAccount();
            }}
          >
            <label>
              Your name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Investor name"
              />
            </label>
            <label>
              Email address
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </label>
            {createError && (
              <p role="alert" className={s.error}>
                {createError}
              </p>
            )}
            <button disabled={creating} className={s.primary}>
              {creating ? "Creating…" : "Create account"}{" "}
              <ArrowRight size={16} />
            </button>
          </form>
          {created && (
            <div className={s.notice}>
              <Check size={16} /> Account #{created.id} created and stored:{" "}
              {created.name} · {created.email}
            </div>
          )}
          <span className={s.eyebrow}>Step 2 · Confirm it was stored</span>
          <h2>Log in with the same credentials.</h2>
          <p className={s.muted}>
            This calls /api/v1/auth/login.php, which reads the row back out
            of MySQL and verifies the password.
          </p>
          <form
            className={s.form}
            onSubmit={(e) => {
              e.preventDefault();
              void confirmLogin();
            }}
          >
            <label>
              Email address
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Same password as above"
              />
            </label>
            {loginError && (
              <p role="alert" className={s.error}>
                {loginError}
              </p>
            )}
            <button disabled={loggingIn} className={s.primary}>
              {loggingIn ? "Checking…" : "Confirm my account"}{" "}
              <ArrowRight size={16} />
            </button>
          </form>
          {confirmed && (
            <div className={s.notice}>
              <Check size={16} /> Retrieved from the database:{" "}
              {confirmed.name} · {confirmed.email} (account #{confirmed.id})
            </div>
          )}
        </div>
        <footer>Proof of concept only — not {BRAND}'s real sign-in.</footer>
      </main>
    </div>
  );
}
