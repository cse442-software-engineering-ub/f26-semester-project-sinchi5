import { Link } from "react-router-dom";
import { GraduationCap, Plus } from "lucide-react";
import { useApp } from "../app/context";
import s from "../app/App.module.css";
import c from "./courses.module.css";

export function Courses({ onAddCourse }: { onAddCourse: () => void }) {
  const { state } = useApp();
  return (
    <>
      <header className={c.header}>
        <h1>Courses</h1>
        <button type="button" className={s.primary} onClick={onAddCourse}>
          <Plus size={16} /> Add course
        </button>
      </header>
      {state.courses.length === 0 ? (
        <div className={c.empty}>
          <GraduationCap size={32} />
          <h2>No courses yet</h2>
          <p>Add a course to keep its notes, events and deadlines together.</p>
        </div>
      ) : (
        <ul className={c.grid}>
          {state.courses.map((course) => (
            <li key={course.id}>
              <Link to={`/courses/${course.id}`} className={c.card}>
                <i className={c.dot} style={{ background: course.color }} />
                <strong>{course.code}</strong>
                <span>{course.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
