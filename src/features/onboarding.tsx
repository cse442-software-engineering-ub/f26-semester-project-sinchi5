import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Check,
  Plus,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useApp } from "../app/context";
import { ImportDialog } from "./imports";
import { BRAND } from "../domain";
import s from "../app/App.module.css";
export function Onboarding() {
  const { state, repo, refresh } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState("welcome");
  const [step, setStep] = useState(state.user ? 1 : 0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [code, setCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [color, setColor] = useState("#869D7A");
  const [term, setTerm] = useState("Fall 2026");
  async function enter(demo = false) {
    setBusy(true);
    try {
      if (demo) {
        await repo.auth.signIn("erin@example.edu", "Erin");
        await repo.auth.completeOnboarding();
        await refresh();
        navigate("/");
        return;
      }
      await repo.auth.signIn(email, name || undefined);
      await refresh();
      setStep(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={s.onboarding}>
      <aside className={s.onboardingArt}>
        <LinkLogo />
        <div>
          <span className={s.eyebrow}>Less scattered. More connected.</span>
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
          <div className={s.paperStack} aria-hidden="true">
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
      <main className={s.onboardingMain}>
        <div className={s.onboardingContent}>
          {step === 0 ? (
            <>
              <span className={s.eyebrow}>Your next chapter</span>
              <h2>
                {mode === "welcome"
                  ? "Welcome to your space."
                  : mode === "signup"
                    ? "A fresh start."
                    : "Good to see you again."}
              </h2>
              <p className={s.muted}>
                {mode === "welcome"
                  ? "Keep the ideas. Lose the clutter."
                  : "A small step toward a more organized semester."}
              </p>
              {mode === "welcome" ? (
                <div className={s.form}>
                  <button
                    className={s.primary}
                    onClick={() => setMode("signup")}
                  >
                    Create your workspace <ArrowRight size={17} />
                  </button>
                  <button
                    className={s.secondary}
                    onClick={() => setMode("signin")}
                  >
                    I already have an account
                  </button>
                  <button
                    className={s.textLink}
                    disabled={busy}
                    onClick={() => void enter(true)}
                  >
                    Take a look around first <ArrowRight size={15} />
                  </button>
                </div>
              ) : (
                <form
                  className={s.form}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void enter();
                  }}
                >
                  {mode === "signup" && (
                    <label>
                      Your name
                      <input
                        required
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="What should we call you?"
                      />
                    </label>
                  )}
                  <label>
                    Email address
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@university.edu"
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      minLength={8}
                      required
                      autoComplete={
                        mode === "signup" ? "new-password" : "current-password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                    />
                    {password.length > 0 && password.length < 8 && (
                      <small>Use at least 8 characters.</small>
                    )}
                  </label>
                  <small className={s.notice}>
                    This is a prototype account. Use a sample password;
                    passwords are never stored.
                  </small>
                  <button disabled={busy} className={s.primary}>
                    {busy
                      ? "Opening your space…"
                      : mode === "signup"
                        ? "Create account"
                        : "Sign in"}{" "}
                    <ArrowRight size={16} />
                  </button>
                  <button
                    type="button"
                    className={s.textLink}
                    onClick={() =>
                      setMode(mode === "signup" ? "signin" : "signup")
                    }
                  >
                    {mode === "signup"
                      ? "Already have an account? Sign in"
                      : "New here? Create an account"}
                  </button>
                </form>
              )}
            </>
          ) : step === 1 ? (
            <>
              <span className={s.eyebrow}>01 / 03 · Your semester</span>
              <h2>What are you learning?</h2>
              <p className={s.muted}>
                Start with these sample courses, or add your own.
              </p>
              <div className={s.courseSetup}>
                {state.courses.map((c) => (
                  <div key={c.id}>
                    <span
                      className={s.courseDot}
                      style={{ background: c.color }}
                    />
                    <span>
                      <strong>{c.code}</strong>
                      <small>{c.name}</small>
                    </span>
                    <Check size={16} />
                  </div>
                ))}
              </div>
              {adding ? (
                <form
                  className={s.form}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await repo.courses.create({
                        code,
                        name: courseName,
                        color,
                        term,
                      });
                      await refresh();
                      setAdding(false);
                      setCode("");
                      setCourseName("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <div className={s.formRow}>
                    <label>
                      Course code
                      <input
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="CSE 250"
                      />
                    </label>
                    <label>
                      Term
                      <input
                        required
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                      />
                    </label>
                  </div>
                  <label>
                    Course name
                    <input
                      required
                      value={courseName}
                      onChange={(e) => setCourseName(e.target.value)}
                    />
                  </label>
                  <label>
                    Course color
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                    />
                  </label>
                  <div className={s.actions}>
                    <button className={s.primary}>Add course</button>
                    <button
                      className={s.secondary}
                      type="button"
                      onClick={() => setAdding(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button className={s.textLink} onClick={() => setAdding(true)}>
                  <Plus size={16} /> Add your own course
                </button>
              )}
              <button className={s.primary} onClick={() => setStep(2)}>
                Looks good <ArrowRight size={16} />
              </button>
            </>
          ) : step === 2 ? (
            <>
              <span className={s.eyebrow}>02 / 03 · Save a little time</span>
              <h2>Let your syllabus do the work.</h2>
              <p className={s.muted}>
                Turn assignments, exams, and due dates into a schedule you can
                actually use.
              </p>
              <button className={s.dropzone} onClick={() => setImporting(true)}>
                <UploadCloud size={38} />
                <strong>Upload a syllabus</strong>
                <span>Review the dates. We’ll take it from there.</span>
              </button>
              <button className={s.primary} onClick={() => setStep(3)}>
                Continue <ArrowRight size={16} />
              </button>
              <button className={s.textLink} onClick={() => setStep(3)}>
                I’ll do this later
              </button>
            </>
          ) : (
            <>
              <span className={s.successIcon}>
                <Sparkles size={30} />
              </span>
              <span className={s.eyebrow}>03 / 03 · All yours</span>
              <h2>
                Room to think.
                <br />
                Space to grow.
              </h2>
              <p className={s.muted}>
                Your workspace is ready, {state.user?.name}. Let’s make this
                semester a little lighter.
              </p>
              <button
                className={s.primary}
                onClick={async () => {
                  try {
                    await repo.auth.completeOnboarding();
                    await refresh();
                    navigate("/");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Let’s begin <ArrowRight size={17} />
              </button>
            </>
          )}
          {error && (
            <p role="alert" className={s.error}>
              {error}
            </p>
          )}
          {step > 1 && step < 3 && (
            <button className={s.textLink} onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
        </div>
        <footer>Made for your mind. Designed for your day.</footer>
      </main>
      {importing && (
        <ImportDialog kind="syllabus" onClose={() => setImporting(false)} />
      )}
    </div>
  );
}
function LinkLogo() {
  return (
    <div className={s.logo}>
      <span>
        <BookOpen size={23} />
      </span>
      {BRAND}
      <i>✦</i>
    </div>
  );
}
