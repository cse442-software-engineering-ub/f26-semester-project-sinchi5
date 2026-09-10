import { Dialog } from "@base-ui/react/dialog";
import {
  X,
  FileText,
  LockKeyhole,
  Users,
  Pin,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useRef, useState, type ReactNode } from "react";
import type { Note, CourseEvent } from "../domain";
import { useApp } from "../app/context";
import s from "../app/App.module.css";
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={s.backdrop} />
        <Dialog.Popup
          finalFocus={() =>
            previousFocus.current?.isConnected
              ? previousFocus.current
              : document.querySelector<HTMLElement>('[aria-label="Create"]')
          }
          className={`${s.modal} ${wide ? s.wide : ""}`}
        >
          <div className={s.modalHeading}>
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description || "Make a little room for your ideas."}
              </Dialog.Description>
            </div>
            <Dialog.Close className={s.iconButton} aria-label="Close">
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={s.empty}>
      <BookOpen size={32} />
      <h3>{title}</h3>
      <p>{children || "A fresh page, full of possibilities."}</p>
    </div>
  );
}
export function NoteCard({ note }: { note: Note }) {
  const { state } = useApp();
  const course = state.courses.find((c) => c.id === note.courseId);
  return (
    <Link to={`/notes/${note.id}`} className={s.noteCard}>
      <div className={s.cardTop}>
        <span
          className={s.courseBadge}
          style={
            {
              "--course-color": course?.color || "#869D7A",
            } as React.CSSProperties
          }
        >
          <i />
          {course?.code || note.category}
        </span>
        {note.pinned ? <Pin size={14} /> : <FileText size={16} />}
      </div>
      <h3>{note.title}</h3>
      <p className={s.excerpt}>{note.body}</p>
      <div className={s.cardFooter}>
        <span>
          {note.visibility === "shared" ? (
            <Users size={13} />
          ) : (
            <LockKeyhole size={13} />
          )}{" "}
          {note.visibility === "shared" ? "Shared" : "Private"}
        </span>
        <span>
          {new Date(note.updatedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </Link>
  );
}
export function EventRow({
  event,
  onClick,
}: {
  event: CourseEvent;
  onClick?: (event: CourseEvent) => void;
}) {
  const { state } = useApp();
  const course = state.courses.find((c) => c.id === event.courseId);
  return (
    <button className={s.eventRow} onClick={() => onClick?.(event)}>
      <span className={s.eventTime}>{event.time || "All day"}</span>
      <span
        className={s.eventBar}
        style={{ background: course?.color || "#869D7A" }}
      />
      <span className={s.eventText}>
        <strong>{event.title}</strong>
        <small>
          {event.kind} · {event.location || course?.code || "Personal"}
          {event.source === "imported" ? " · Imported" : ""}
        </small>
      </span>
      <ArrowUpRight size={16} />
    </button>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className={s.pageHeading}>
      <div>
        {eyebrow && <span className={s.eyebrow}>{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className={s.actions}>{actions}</div>
    </header>
  );
}
export function DateLabel({ date }: { date: string }) {
  return (
    <span className={s.muted}>
      <CalendarDays size={14} />{" "}
      {new Date(date + "T12:00:00").toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })}
    </span>
  );
}
