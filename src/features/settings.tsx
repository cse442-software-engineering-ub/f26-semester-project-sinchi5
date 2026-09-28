import { AccountSettings } from "./account";
import { useState } from "react";
import { Sun, Moon, Monitor, Plus, BookOpen } from "lucide-react";
import { useApp } from "../app/context";
import { Modal, PageHeading } from "../shared/ui";
import s from "../app/App.module.css";
export function Settings() {
  const { state, repo, refresh, setTheme } = useApp();
  const [reset, setReset] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const isDemo = state.user?.id === "student";
  return (
    <>
      <PageHeading
        eyebrow="Just the way you like it"
        title="Settings"
        description="Manage your account, appearance, and courses."
      />
      <div className={s.settingsGrid}>
        <AccountSettings />
        <section className={s.panel} aria-labelledby="appearance-heading">
          <div className={s.settingsHeading}>
            <h2 id="appearance-heading">Appearance</h2>
            <p className={s.muted}>Choose a theme, or follow your device.</p>
          </div>
          <div className={s.themeOptions}>
            {[
              ["light", "Light", Sun],
              ["dark", "Dark", Moon],
              ["system", "System", Monitor],
            ].map(([key, label, Icon]) => {
              const I = Icon as typeof Sun;
              return (
                <button
                  key={key as string}
                  aria-pressed={state.theme === key}
                  className={state.theme === key ? s.activeButton : ""}
                  onClick={() => setTheme(key as string)}
                >
                  <I size={22} />
                  {label as string}
                </button>
              );
            })}
          </div>
        </section>
        <section className={s.panel} aria-labelledby="courses-heading">
          <div className={s.settingsHeading}>
            <span>
              <h2 id="courses-heading">Courses</h2>
              <p className={s.muted}>The classes you organize notes and events around.</p>
            </span>
            <button
              className={s.secondary}
              onClick={() => {
                setError("");
                setAdding(true);
              }}
            >
              <Plus size={16} /> Add course
            </button>
          </div>
          {state.courses.length ? (
            <ul className={s.settingRows}>
              {state.courses.map((c) => (
                <li className={s.settingCourse} key={c.id}>
                  <span className={s.courseDot} style={{ background: c.color }} />
                  <span>
                    <strong>{c.code}</strong>
                    <small>{c.name}</small>
                  </span>
                  <small>{c.term}</small>
                </li>
              ))}
            </ul>
          ) : (
            <div className={s.courseEmpty}>
              <BookOpen size={22} aria-hidden="true" />
              <strong>No courses yet</strong>
              <span>Add a course to start organizing your notes by class.</span>
            </div>
          )}
        </section>
        <section className={s.panel} aria-labelledby="data-heading">
          <div className={s.settingsHeading}>
            <h2 id="data-heading">Workspace data</h2>
            <p className={s.muted}>
              Notes, courses, and events are saved in this browser.
            </p>
          </div>
          <ul className={s.settingRows}>
            <li>
              <span>
                <strong>{isDemo ? "Reset sample data" : "Clear workspace"}</strong>
                <small>
                  {isDemo
                    ? "Start again with the original sample workspace."
                    : "Remove every note, course, and event in this browser."}
                </small>
              </span>
              <button className={s.secondary} onClick={() => { setError(""); setReset(true); }}>
                {isDemo ? "Reset sample data" : "Clear workspace"}
              </button>
            </li>
          </ul>
          {error && !adding && !reset && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
      {reset && (
        <Modal
          title="Start fresh?"
          description={`This removes notes, ${isDemo ? "comments" : "courses"}, and events you created in this browser. It cannot be undone.`}
          onClose={() => setReset(false)}
        >
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
          <button
            className={s.danger}
            onClick={async () => {
              try {
                await repo.reset();
                await refresh();
                setReset(false);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {isDemo ? "Reset workspace" : "Clear workspace"}
          </button>
        </Modal>
      )}
      {adding && (
        <Modal
          title="Add a course"
          description="Give it a code and a name. You can pick a color to spot it at a glance."
          onClose={() => setAdding(false)}
        >
          <form
            className={s.form}
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              setError("");
              try {
                await repo.courses.create({
                  code: String(data.get("code")),
                  name: String(data.get("name")),
                  term: String(data.get("term")),
                  color: String(data.get("color")),
                });
                await refresh();
                setAdding(false);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <div className={s.formRow}>
              <label>
                Course code
                <input name="code" required placeholder="CSE 250" />
              </label>
              <label>
                Term
                <input name="term" required defaultValue="Fall 2026" />
              </label>
            </div>
            <label>
              Course name
              <input name="name" required placeholder="Data Structures" />
            </label>
            <label>
              Color
              <input name="color" type="color" defaultValue="#869D7A" />
            </label>
            {error && (
              <p className={s.error} role="alert">
                {error}
              </p>
            )}
            <button className={s.primary}>Add course</button>
          </form>
        </Modal>
      )}
    </>
  );
}
