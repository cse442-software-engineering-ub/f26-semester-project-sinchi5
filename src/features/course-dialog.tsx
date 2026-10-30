import { useState } from "react";
import { useApp } from "../app/context";
import { Modal } from "../shared/ui";
import { ImportDialog } from "./imports";
import s from "../app/App.module.css";


export function AddCourseDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const { repo, refresh } = useApp();
  const [error, setError] = useState("");
  const [syllabus, setSyllabus] = useState<File>();
  const [syllabusError, setSyllabusError] = useState("");
  const [startingImport, setStartingImport] = useState<{
    file: File;
    courseId: string;
 }>();

 if (startingImport) {
    return (
        <ImportDialog
        kind="syllabus"
        startingFile={startingImport.file}
        startingCourseId={startingImport.courseId}
        onClose={onClose}
        />
    );
    }

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
            const course = await repo.courses.create({
            code: String(data.get("code")),
            name: String(data.get("name")),
            term: String(data.get("term")),
            color: String(data.get("color")),
            });

            await refresh();

            if (syllabus) {
            setStartingImport({
                file: syllabus,
                courseId: course.id,
            });
            return;
            }

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

        <label>
            Syllabus (optional)
            <input
                type="file"
                aria-label="Choose a syllabus file"
                accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp"
                onChange={(e) => {
                const file = e.target.files?.[0];

                if (!file) {
                    setSyllabus(undefined);
                    setSyllabusError("");
                    return;
                }

                const validationError = repo.imports.validate(
                    file,
                    "syllabus",
                );

                setSyllabus(file);
                setSyllabusError(validationError ?? "");
                }}
            />
            </label>

            {syllabus && (
            <div>
                <span>{syllabus.name}</span>

                <button
                type="button"
                onClick={() => {
                    setSyllabus(undefined);
                    setSyllabusError("");
                }}
                >
                Remove file
                </button>
            </div>
            )}

            {syllabusError && (
            <p className={s.error} role="alert">
                {syllabusError}
            </p>
            )}

        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}

        <button
            className={s.primary}
            disabled={Boolean(syllabusError)}
            >
            Add course
            </button>
      </form>
    </Modal>
  );
}