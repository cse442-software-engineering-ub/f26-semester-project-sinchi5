import { notePreview } from "../services/noteText";
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
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useRef, useState, type ReactNode } from "react";
import type { Note, CourseEvent, User } from "../domain";
import { useApp } from "../app/context";
import s from "./ui.module.css";

export function Avatar({ user, className = "", alt = "", version = 0 }: {
  user: User;
  className?: string;
  alt?: string;
  version?: number;
}) {
  const [failedPhoto, setFailedPhoto] = useState("");
  // Stable between photo changes; account identity prevents reusing another user's image.
  const photoUrl = `${import.meta.env.BASE_URL}api/index.php?route=profile-photo&v=${encodeURIComponent(`${user.id}-${version}`)}`;
  const initial = [...(user.name.trim() || user.email.trim() || "?")][0].toUpperCase();
  return <span className={`${s.avatar} ${className}`} aria-hidden={alt === "" ? true : undefined}>
    {user.hasPhoto && failedPhoto !== photoUrl
      ? <img src={photoUrl} alt={alt} onError={() => setFailedPhoto(photoUrl)} />
      : initial}
  </span>;
}

export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
  dismissible = true,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  dismissible?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => { if (next || dismissible) setOpen(next); }}
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
            <Dialog.Close className={s.iconButton} aria-label="Close" disabled={!dismissible}>
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function DeleteNoteDialog({
  title,
  onDelete,
  onClose,
}: {
  title: string;
  // Resolves once the note is gone; the caller then unmounts the dialog.
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setDeleting(true);
    setError("");
    try {
      await onDelete();
    } catch (e) {
      // Stay disabled after success until the caller removes the dialog.
      pending.current = false;
      setDeleting(false);
      setError(`This note could not be deleted. ${(e as Error).message}`);
    }
  }
  return (
    <Modal
      title="Delete this note?"
      description={`“${title}” and its comments and history will be permanently removed. This can’t be undone.`}
      dismissible={!deleting}
      onClose={onClose}
    >
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      {deleting && <p role="status">Deleting note…</p>}
      <div className={s.actions}>
        <Dialog.Close className={s.secondary} disabled={deleting}>
          Cancel
        </Dialog.Close>
        <button className={s.danger} disabled={deleting} onClick={confirm}>
          Delete note
        </button>
      </div>
    </Modal>
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
export function NoteCard({
  note,
  onDelete,
}: {
  note: Note;
  onDelete?: () => void;
}) {
  const { state } = useApp();
  const course = state.courses.find((c) => c.id === note.courseId);
  const card = (
    <Link to={`/notes/${note.id}`} className={s.noteCard} style={{ "--course-color": course?.color || "var(--hover-line)" } as React.CSSProperties}>
      <div className={s.cardTop}>
        <span className={s.courseBadge}>
          <i />
          {course?.code || note.category}
        </span>
        {note.pinned ? (
          <span className={s.pinnedBadge}>
            <Pin size={14} aria-hidden="true" /> Pinned
          </span>
        ) : <FileText size={16} aria-hidden="true" />}
      </div>
      <h3>{note.title}</h3>
      <p className={s.excerpt}>{notePreview(note)}</p>
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
  if (!onDelete) return card;
  // The card is one link, so its action sits beside it instead of inside it.
  return (
    <div className={s.noteItem}>
      {card}
      <button
        type="button"
        className={s.cardAction}
        aria-label={`Delete ${note.title}`}
        onClick={onDelete}
      >
        <Trash2 size={14} aria-hidden="true" /> Delete
      </button>
    </div>
  );
}
// Use an ordinary space before AM/PM, regardless of the browser's locale spacing.
export function formatEventTime(time: string) {
  const parts = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(time);
  if (!parts) return time;
  const hours = Number(parts[1]);
  return `${hours % 12 || 12}:${parts[2]} ${hours < 12 ? "AM" : "PM"}`;
}

// "1 note", "2 notes".
export const countOf = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// "December 1 · 5:00 PM", or "December 1 · All day" when the event has no time.
export function formatEventWhen(date: string, time: string) {
  const day = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" });
  return `${day} · ${time ? formatEventTime(time) : "All day"}`;
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
      <span className={s.eventTime}>{event.time ? formatEventTime(event.time) : "All day"}</span>
      <span
        className={s.eventBar}
        style={{ background: course?.color || "var(--hover-line)" }}
      />
      <span className={s.eventText}>
        <strong>{event.title}</strong>
        <small>
          {event.kind} · {course?.code || (event.location ? "" : "Personal")}
          {course?.code && event.location ? " · " : ""}{event.location}
          {event.source === "imported" ? " · Imported" : ""}
          {/* Card 144: an event from a classmate's shared course says whose it is. */}
          {event.sharedBy && <span className={s.asWritten}> · Shared by {event.sharedBy.name}</span>}
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
      <h1>{title}</h1>
      <div className={s.actions}>{actions}</div>
      {/* Card 251: the old eyebrow reads as the quiet meta line under the title, never as a label above it. */}
      {(eyebrow || description) && (
        <div className={s.pageMeta}>
          {eyebrow && <span className={s.eyebrow}>{eyebrow}</span>}
          {description && <p>{description}</p>}
        </div>
      )}
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

// Card 251: the planner material every screen builds on.
export function Sheet({ children, label, className = "" }: { children: ReactNode; label?: string; className?: string }) {
  return <section className={`${s.sheet} ${className}`} aria-label={label}>{children}</section>;
}

// Two facing pages split by a spine; the pages stack when the sheet is narrower than 720 px (a container query).
export function Spread({ left, right, label, className = "" }: { left: ReactNode; right: ReactNode; label?: string; className?: string }) {
  return (
    <section className={`${s.sheet} ${s.spread} ${className}`} aria-label={label}>
      <div className={s.spreadGrid}>
        <div className={s.leaf} data-page>{left}</div>
        <div className={s.spine} data-spine aria-hidden="true" />
        <div className={s.leaf} data-page>{right}</div>
      </div>
    </section>
  );
}

// "Due tonight 11:59 PM" (tone="due") or "In 12 days" (the quiet default).
export function Chip({ tone = "later", children }: { tone?: "due" | "later"; children: ReactNode }) {
  return <span className={`${s.chip} ${tone === "due" ? s.chipDue : ""}`} data-tone={tone}>{children}</span>;
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Sunday to Saturday around `date` (YYYY-MM-DD). Today is the filled accent disc, `marked` days get a dot.
// Props only: the screen owns the data and decides what prev, next, Today and a day click do.
export function WeekStrip({
  date,
  today = isoDay(new Date()),
  marked = [],
  selected,
  onPrev,
  onNext,
  onToday,
  onSelect,
}: {
  date: string;
  today?: string;
  marked?: string[];
  selected?: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelect?: (day: string) => void;
}) {
  const start = new Date(`${date}T12:00:00`);
  start.setDate(start.getDate() - start.getDay());
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12));
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  const [first, last] = [days[0], days[6]];
  const range = `${month(first)} ${first.getDate()} – ${first.getMonth() === last.getMonth() ? "" : `${month(last)} `}${last.getDate()}`;
  const busy = new Set(marked);
  return (
    <div className={s.weekStrip} role="group" aria-label={`Week of ${range}`}>
      <div className={s.weekDays}>
        {days.map((d) => {
          const key = isoDay(d);
          const name = `${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${key === today ? ", today" : ""}${busy.has(key) ? ", has items" : ""}`;
          const face = (
            <>
              <span data-weekday aria-hidden="true">{d.toLocaleDateString("en-US", { weekday: "narrow" })}</span>
              <span data-date aria-hidden="true" className={s.weekDate}>{d.getDate()}</span>
              {busy.has(key) ? <i data-dot aria-hidden="true" className={s.weekDot} /> : <i aria-hidden="true" className={s.weekDot} data-empty />}
            </>
          );
          const shared = { "data-day": key, "aria-current": key === today ? ("date" as const) : undefined, "data-selected": key === selected || undefined, className: s.weekDay };
          return onSelect ? (
            <button key={key} type="button" {...shared} aria-label={name} onClick={() => onSelect(key)}>{face}</button>
          ) : (
            <span key={key} {...shared}>{face}<span className={s.srOnly}>{name}</span></span>
          );
        })}
      </div>
      <div className={s.weekNav}>
        <strong className={s.weekRange}>{range}</strong>
        <button type="button" className={s.iconButton} aria-label="Previous week" onClick={onPrev}><ChevronLeft size={18} /></button>
        <button type="button" className={s.secondary} onClick={onToday}>Today</button>
        <button type="button" className={s.iconButton} aria-label="Next week" onClick={onNext}><ChevronRight size={18} /></button>
      </div>
    </div>
  );
}
