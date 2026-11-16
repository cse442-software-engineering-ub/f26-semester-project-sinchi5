import { useState } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, Plus, FileText } from "lucide-react";
import { useApp } from "../app/context";
import { dateKey } from "../services/fixtures";
import { ImportDialog } from "./imports";
import s from "../shared/ui.module.css";
import c from "./courses.module.css";

export function Courses({ onAddCourse }: { onAddCourse: () => void }) {
  const { state } = useApp();
  const [uploading, setUploading] = useState(false);
  const today = dateKey();
  const actions = (
    <>
      <button type="button" className={s.primary} onClick={onAddCourse}>
        <Plus size={16} /> Add course
      </button>
      <button type="button" className={s.secondary} onClick={() => setUploading(true)}>
        <FileText size={16} /> Upload syllabus
      </button>
    </>
  );
  return (
    <>
      <header className={c.header}>
        <h1>Courses</h1>
        {state.courses.length > 0 && <div className={c.actions}>{actions}</div>}
      </header>
      {state.courses.length === 0 ? (
        <div className={c.empty}>
          <GraduationCap size={32} />
          <h2>No courses yet</h2>
          <p>Use Add course to keep its notes, events and deadlines together.</p>
          <div className={c.actions}>{actions}</div>
        </div>
      ) : (
        <ul className={c.grid}>
          {state.courses.map((course) => {
            const next = state.events
              .filter((e) => e.courseId === course.id && e.date >= today)
              .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
            const notes = state.notes.filter((n) => n.courseId === course.id).length;
            return (
              <li key={course.id}>
                <Link to={`/courses/${course.id}`} className={c.card}>
                  <i className={c.dot} style={{ background: course.color }} />
                  <strong>{course.code}</strong>
                  <span>{course.name}</span>
                  <span>{course.term}</span>
                  {next && <span>Next: {next.title} · {next.date}</span>}
                  <span>{notes === 1 ? "1 note" : `${notes} notes`}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {uploading && <ImportDialog kind="syllabus" onClose={() => setUploading(false)} />}
    </>
  );
}
