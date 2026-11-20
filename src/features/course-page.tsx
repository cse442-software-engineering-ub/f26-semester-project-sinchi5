import { useEffect, useState } from "react";
import {
  useParams,
  useSearchParams,
  useNavigate,
  Link,
} from "react-router-dom";
import {
  CalendarDays,
  Users,
  Plus,
} from "lucide-react";
import { useApp, useHoldRefresh } from "../app/context";
import { Spread, Chip, NoteCard, Empty, DeleteDialog, countOf, formatEventWhen } from "../shared/ui";
import { NoteServiceError } from "../services/notes-http";
import { dateKey } from "../services/fixtures";
import { meetingTimes } from "./course-meetings";
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
  const { state, repo, refresh } = useApp();
  const navigate = useNavigate();
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
  const [startError, setStartError] = useState("");
  const [deleteId, setDeleteId] = useState<string>();
  useHoldRefresh(owned && deleteId === id);
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
  async function deleteCourse() {
    try {
      await repo.courses.remove(id);
    } catch (error) {
      // Another window may have deleted it. Verify absence before leaving the detail page.
      if (!(error instanceof NoteServiceError) || error.status !== 404
          || (await repo.courses.list()).some(c => c.id === id)) throw error;
    }
    await refresh();
    navigate("/courses", { replace: true });
  }
  const today = dateKey();
  const meets = meetingTimes(state.events.filter((e) => e.courseId === id));
  const days = (date: string) =>
    Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  // A note for today's lecture lands in today's folder on this course (card 120 groups notes by lecture date).
  async function startNote() {
    setStartError("");
    try {
      const n = await repo.notes.create({ courseId: id, lectureDate: today });
      await refresh();
      navigate(`/notes/${n.id}`, { state: { newNote: true } });
    } catch (e) {
      setStartError((e as Error).message);
    }
  }
  const lectures = Object.entries(folders)
    .filter(([date]) => !selected || date === selected)
    .sort(([a], [b]) => b.localeCompare(a));
  const left = (
    <>
      <span className={css.tab} style={{ background: course.color }} aria-hidden="true" />
      <header className={css.header}>
        <h1>{course.name}</h1>
        <p className={css.meta}>
          <strong>{course.code}</strong>
          <span>{course.term}</span>
          {meets && <span>{meets}</span>}
        </p>
        <p className={`${s.muted} ${css.shareStatus}`} role="status">
          {course.sharedBy
            ? `Shared by ${course.sharedBy.name}. You can ${course.permission === "edit" ? "edit" : "view"} its schedule.`
            : shareError || (shares && sharedLabel(shares))}
        </p>
      </header>
      {selected && (
        <div className={s.notice}>
          Lecture notes for {selected} ·{" "}
          <Link to={`/courses/${id}`}>Show all lectures</Link>
        </div>
      )}
      {owned && (
        <div className={css.startRow}>
          <button type="button" className={s.primary} onClick={() => void startNote()}>
            <Plus size={16} aria-hidden="true" /> Start a note
          </button>
          <span className={s.hint}>for today’s lecture</span>
        </div>
      )}
      {startError && <p className={s.error} role="alert">{startError}</p>}
      {lectures.map(([date, notes]) => (
        <section key={date} className={css.lecture}>
          <div className={css.lectureHead}>
            <h2>
              {date ? new Date(date + "T12:00:00").toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
              }) : "Lecture date: Not detected"}
            </h2>
            <span className={s.muted}>{countOf(notes.length, "note")}</span>
          </div>
          <div className={css.notes}>
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
    </>
  );
  // A weekly class would fill this list with every meeting of the term (card 48).
  const coming = state.events
    .filter((e) => e.courseId === id && !e.seriesId)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const right = (
    <>
      <section className={css.coming} aria-labelledby="coming-up-course">
        <h2 id="coming-up-course">Coming up in this course</h2>
        {coming.length === 0 && <p className={`${s.muted} ${css.none}`}>Nothing due yet.</p>}
        {coming.map((e) => {
          const away = days(e.date);
          return (
            <Link
              key={e.id}
              to={`/schedule?date=${e.date}`}
              className={css.eventLink}
              data-past={away < 0 || undefined}
            >
              <span className={css.when}>
                {formatEventWhen(e.date, e.time)}
              </span>
              <strong>{e.title}</strong>
              <small>{e.kind}</small>
              {away === 0 ? <Chip tone="due">Today</Chip> : away > 0 ? <Chip>{`In ${countOf(away, "day")}`}</Chip> : <Chip>Past</Chip>}
            </Link>
          );
        })}
      </section>
      <section className={css.manage} aria-labelledby="manage-course">
        <h2 id="manage-course">Share and manage</h2>
        <div className={s.actions}>
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
          {owned && <button type="button" className={s.dangerOutline} onClick={() => setDeleteId(id)}>Delete course</button>}
        </div>
      </section>
    </>
  );
  return (
    <>
      <Spread label={course.name} className={css.spread} left={left} right={right} />
      {owned && deleteId === id && (
        <DeleteDialog item="course" title={course.code} onDelete={deleteCourse} onClose={() => setDeleteId(undefined)} />
      )}
      {sharingSchedule && <ShareScheduleDialog course={course} onClose={() => setSharingSchedule(false)} />}
      {uploading && <ImportDialog kind="syllabus" startingCourseId={id} onClose={() => setUploading(false)} />}
      {sharing && (
        <ShareNotesDialog course={course} shares={shares ?? []} onClose={() => setSharing(false)}
          onSaved={(next) => { setShares(next); setShareError(""); setSharing(false); }} />
      )}
    </>
  );
}
