import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sun, Moon, Monitor, Plus } from "lucide-react";
import { useApp } from "../app/context";
import { Modal, PageHeading } from "../shared/ui";
import s from "../app/App.module.css";
export function Settings() {
  const { state, repo, refresh, setTheme } = useApp();
  const navigate = useNavigate();
  const [reset, setReset] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <PageHeading
        eyebrow="Just the way you like it"
        title="Your space, your way"
        description="A few small details that make it feel like you."
      />
      <div className={s.settingsGrid}>
        <section className={s.panel}>
          <h2>Appearance</h2>
          <p className={s.muted}>Find your comfortable light.</p>
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
                  <I size={24} />
                  {label as string}
                </button>
              );
            })}
          </div>
        </section>
        <section className={s.panel}>
          <h2>Your account</h2>
          <h3>{state.user?.name}</h3>
          <p className={s.muted}>{state.user?.email}</p>
          <button
            className={s.secondary}
            onClick={async () => {
              await repo.auth.signOut();
              await refresh();
              navigate("/welcome");
            }}
          >
            Sign out
          </button>
        </section>
        <section className={s.panel}>
          <div className={s.sectionHeading}>
            <h2>Your courses</h2>
            <button
              className={s.iconButton}
              aria-label="Add course"
              onClick={() => setAdding(true)}
            >
              <Plus size={18} />
            </button>
          </div>
          {state.courses.map((c) => (
            <div className={s.settingCourse} key={c.id}>
              <span className={s.courseDot} style={{ background: c.color }} />
              <strong>{c.code}</strong>
              <span>{c.name}</span>
              <small>{c.term}</small>
            </div>
          ))}
        </section>
        <section className={s.panel}>
          <h2>Prototype workspace</h2>
          <p className={s.muted}>
            Notes and changes are saved in this browser. Reset to start again
            with the sample workspace.
          </p>
          <button className={s.secondary} onClick={() => setReset(true)}>
            Reset sample data
          </button>
        </section>
      </div>
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      {reset && (
        <Modal
          title="Start fresh?"
          description="This removes notes, comments, and events you created in this browser. It cannot be undone."
          onClose={() => setReset(false)}
        >
          <button
            className={s.danger}
            onClick={async () => {
              try {
                await repo.reset();
                await refresh();
                navigate("/welcome");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Reset workspace
          </button>
        </Modal>
      )}
      {adding && (
        <Modal title="Something new to learn" onClose={() => setAdding(false)}>
          <form
            className={s.form}
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
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
            <label>
              Course code
              <input name="code" required />
            </label>
            <label>
              Course name
              <input name="name" required />
            </label>
            <label>
              Term
              <input name="term" required defaultValue="Fall 2026" />
            </label>
            <label>
              Color
              <input name="color" type="color" defaultValue="#869D7A" />
            </label>
            <button className={s.primary}>Add course</button>
          </form>
        </Modal>
      )}
    </>
  );
}
