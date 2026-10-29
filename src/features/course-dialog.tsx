import { useState } from "react";
import { useApp } from "../app/context";
import { Modal } from "../shared/ui";
import s from "../app/App.module.css";

export function AddCourseDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const { repo, refresh } = useApp();
  const [error, setError] = useState("");

  return (
    <Modal
      title="Add a course"
      description="Give it a code and a name. You can pick a color to spot it at a glance."
      onClose={onClose}
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
            onClose();
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
  );
}