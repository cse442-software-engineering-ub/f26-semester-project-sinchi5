import { useEffect, useState } from "react";
import {
  useParams,
  useSearchParams,
  Link,
} from "react-router-dom";
import {
  CalendarDays,
  Users,
} from "lucide-react";
import { useApp } from "../app/context";
import { PageHeading, NoteCard, Empty, countOf, formatEventWhen } from "../shared/ui";
import type {
  Note,
  CourseShare,
} from "../domain";
import s from "../shared/ui.module.css";
import css from "./course-page.module.css";
import { createHttpNoteShares } from "../services/note-shares-http";
import { ShareNotesDialog, sharedLabel } from "./share-notes";
import { ImportDialog } from "./imports";
import { ShareScheduleDialog } from "./share-schedule";

export function CoursePage() {
  const { id = "" } = useParams();
  const { state, repo } = useApp();
  const [params] = useSearchParams();
  const course = state.courses.find((c) => c.id === id);
  // Card 144: a classmate's shared course is view only, so its owner's sharing and upload controls are left out.
  const owned = !!course && !course.sharedBy;
  const [folders, setFolders] = useState<Record<string, Note[]>>({});
  // Card 157: who this course's notes are shared with (card 156).
  const [shares, setShares] = useState<CourseShare[]>();
  const [shareError, setShareError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sharingSchedule, setSharingSchedule] = useState(false);
  useEffect(() => {
    void repo.courses.folders(id).then(setFolders);
  }, [id, state.notes]);
  useEffect(() => {
    setShares(undefined);
    setShareError("");
    if (!owned) return;
    createHttpNoteShares().shares(id).then(setShares, (e: Error) => setShareError(e.message));
  }, [id, owned]);
  if (!course)
    return (
      <Empty title="Course not found">
        <Link to="/notes">Browse your notes</Link>
      </Empty>
    );
  const selected = params.get("lecture");
  return (
    <>
      <PageHeading
        eyebrow={course.code + " · " + course.term}
        title={course.name}
        description="Your lectures, notes, and next steps."
        actions={
          <>
            {owned && (
              <>
                <button className={s.secondary} onClick={() => setUploading(true)}>
                  Upload syllabus
                </button>
                <button className={s.secondary} onClick={() => setSharingSchedule(true)}>
                  <CalendarDays size={17} aria-hidden="true" /> Share schedule
                </button>
                <button className={s.secondary} onClick={() => setSharing(true)}>
                  <Users size={17} aria-hidden="true" /> Share notes with friends
                </button>
              </>
            )}
            <Link className={s.secondary} to={`/notes?course=${id}`}>
              All course notes
            </Link>
          </>
        }
      />
      <p className={`${s.muted} ${css.shareStatus}`} role="status">
        {course.sharedBy
          ? `Shared by ${course.sharedBy.name}. You can view its schedule.`
          : shareError || (shares && sharedLabel(shares))}
      </p>
      {sharingSchedule && <ShareScheduleDialog course={course} onClose={() => setSharingSchedule(false)} />}
      {uploading && <ImportDialog kind="syllabus" startingCourseId={id} onClose={() => setUploading(false)} />}
      {sharing && (
        <ShareNotesDialog course={course} shares={shares ?? []} onClose={() => setSharing(false)}
          onSaved={(next) => { setShares(next); setShareError(""); setSharing(false); }} />
      )}
      {selected && (
        <div className={s.notice}>
          Lecture notes for {selected} ·{" "}
          <Link to={`/courses/${id}`}>Show all lectures</Link>
        </div>
      )}
      {Object.entries(folders)
        .filter(([date]) => !selected || date === selected)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, notes]) => (
          <section key={date} className={s.section}>
            <div className={s.sectionHeading}>
              <h2>
                {date ? new Date(date + "T12:00:00").toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                }) : "Lecture date: Not detected"}
              </h2>
              <span className={s.muted}>{countOf(notes.length, "note")}</span>
            </div>
            <div className={s.noteGrid}>
              {notes.map((n) => (
                <NoteCard note={n} key={n.id} />
              ))}
            </div>
          </section>
        ))}
      {(!Object.keys(folders).length || (selected && !folders[selected])) && (
        <Empty title="A fresh lecture folder">
          No notes here yet.{" "}
          <Link to={`/notes?course=${id}`}>Browse this course’s notes</Link>
        </Empty>
      )}
      <section className={s.panel}>
        <h2>Coming up in this course</h2>
        {/* A weekly class would fill this list with every meeting of the term (card 48). */}
        {state.events
          .filter((e) => e.courseId === id && !e.seriesId)
          .map((e) => (
            <Link
              key={e.id}
              to={`/schedule?date=${e.date}`}
              className={css.eventLink}
            >
              <span>
                {formatEventWhen(e.date, e.time)}
              </span>
              <strong>{e.title}</strong>
              <small>{e.kind}</small>
            </Link>
          ))}
      </section>
    </>
  );
}
