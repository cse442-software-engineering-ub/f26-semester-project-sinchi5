import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, Plus, FileText } from "lucide-react";
import { useApp } from "../app/context";
import { dateKey } from "../services/fixtures";
import { PageHeading, Sheet, countOf } from "../shared/ui";
import { ImportDialog } from "./imports";
import { meetingTimes } from "./course-meetings";
import s from "../shared/ui.module.css";
import c from "./courses.module.css";

export function Courses({ onAddCourse }: { onAddCourse: () => void }) {
  const { state } = useApp();
  const [uploading, setUploading] = useState(false);
  const today = dateKey();
  const addButton = (primary: boolean) => (
    <button type="button" className={`${primary ? s.primary : s.secondary} ${c.act}`} onClick={onAddCourse}>
      <Plus size={16} /> Add course
    </button>
  );
  const uploadButton = (primary: boolean) => (
    <button type="button" className={`${primary ? s.primary : s.secondary} ${c.act}`} onClick={() => setUploading(true)}>
      <FileText size={16} /> Upload syllabus
    </button>
  );
  const empty = state.courses.length === 0;
  return (
    <>
      <PageHeading
        title="Courses"
        description={empty ? "Each course keeps its notes and due dates together." : `${countOf(state.courses.length, "course")}, each with its notes and due dates.`}
        actions={empty ? undefined : <span className={c.bar}>{addButton(true)}{uploadButton(false)}</span>}
      />
      {empty ? (
        <Sheet className={c.empty} label="No courses">
          <GraduationCap size={32} aria-hidden="true" />
          <h2>No courses yet</h2>
          <p>
            Upload a syllabus and Notely finds your class times and due dates, ready for you to check.
            Or add a course by hand to keep its notes, events and deadlines together.
          </p>
          <div className={`${s.actions} ${c.emptyActions}`}>{uploadButton(true)}{addButton(false)}</div>
        </Sheet>
      ) : (
        <ul className={c.grid}>
          {state.courses.map((course) => {
            const own = state.events.filter((e) => e.courseId === course.id);
            const byTime = (a: { date: string; time: string }, b: { date: string; time: string }) =>
              (a.date + a.time).localeCompare(b.date + b.time);
            const next = own.filter((e) => e.date >= today).sort(byTime)[0];
            // A weekly class would count every meeting of the term, so only dated work counts (card 48).
            const due = own.filter((e) => e.date >= today && !e.seriesId).length;
            const notes = state.notes.filter((n) => n.courseId === course.id).length;
            const meets = meetingTimes(own);
            return (
              <li key={course.id}>
                <Link to={`/courses/${course.id}`} className={c.card} style={{ "--tab": course.color } as CSSProperties}>
                  <i className={c.tab} aria-hidden="true" />
                  <strong className={c.code}>{course.code}</strong>
                  <span className={c.name}>{course.name}</span>
                  <span className={c.meta}>{course.term}</span>
                  {meets && <span className={c.meta}>{meets}</span>}
                  {course.sharedBy && <span className={c.meta}>Shared by {course.sharedBy.name}</span>}
                  {next && <span className={c.meta}>Next: {next.title} · {next.date}</span>}
                  <i className={c.spacer} aria-hidden="true" />
                  <span className={c.counts}>
                    <span>{notes === 1 ? "1 note" : `${notes} notes`}</span>
                    <span>{countOf(due, "upcoming item")}</span>
                  </span>
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
