import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  FileText,
  Camera,
  UploadCloud,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { useApp } from "../app/context";
import { PageHeading, NoteCard, EventRow, Empty } from "../shared/ui";
import { dateKey } from "../services/fixtures";
import { EventDialog } from "./schedule";
import type { CourseEvent, UploadKind } from "../domain";
import s from "../app/App.module.css";
export function Dashboard({
  onImport,
  onCreate,
}: {
  onImport: (kind: UploadKind) => void;
  onCreate: () => void;
}) {
  const { state } = useApp();
  const [event, setEvent] = useState<CourseEvent>();
  const today = dateKey();
  const day = state.events.filter((e) => e.date === today);
  const deadlines = state.events
    .filter((e) => e.kind !== "lecture" && e.date >= today)
    .slice(0, 3);
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const quick = [...state.notes]
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
    .slice(0, 3);
  return (
    <>
      <PageHeading
        eyebrow={new Date().toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
        title={`${greeting}, ${state.user?.name.split(" ")[0] || "friend"}.`}
        description="A fresh page. A clear mind. Let’s make today a good one."
        actions={
          <button className={s.primary} onClick={onCreate}>
            <Plus size={17} /> New note
          </button>
        }
      />
      <section className={s.hero}>
        <div className={s.heroCopy}>
          <span className={s.heroEyebrow}>
            <span /> YOUR SPACE TO THINK
          </span>
          <h2>
            Big ideas start
            <br />
            with a little note.
          </h2>
          <p>
            Pick up where you left off, or turn a fresh
            <br className={s.desktopOnly} /> page. Your next idea is waiting.
          </p>
          <Link className={s.heroLink} to="/notes">
            Find your flow <ArrowRight size={17} />
          </Link>
        </div>
        <div className={s.heroArt} aria-hidden="true">
          <span className={s.starOne}>✳</span>
          <span className={s.starTwo}>✦</span>
          <div className={s.artOrbit} />
          <div className={s.artBack} />
          <div className={s.artPaper}>
            <span>
              <BookOpen size={21} /> a little note
            </span>
            <h3>
              Less noise.
              <br />
              More possibility.
            </h3>
            <i />
            <i />
            <i />
            <div>
              good things are taking shape <span>↗</span>
            </div>
          </div>
          <div className={s.artChip}>
            <Sparkles size={15} /> One thought at a time
          </div>
        </div>
      </section>
      <div className={s.dashboardGrid}>
        <div>
          <section className={s.section}>
            <div className={s.sectionHeading}>
              <div>
                <h2>Pick up where you left off</h2>
                <p>Your ideas, right within reach.</p>
              </div>
              <Link className={s.textLink} to="/notes">
                All notes <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className={s.quickNotes}>
              {quick.map((n) => (
                <NoteCard key={n.id} note={n} />
              ))}
            </div>
          </section>
          <section className={s.section}>
            <div className={s.sectionHeading}>
              <div>
                <h2>Make it your own</h2>
                <p>A few ways to bring your thoughts together.</p>
              </div>
            </div>
            <div className={s.quickActions}>
              <button onClick={onCreate}>
                <span>
                  <FileText size={21} />
                </span>
                <strong>Start a note</strong>
                <small>A blank page. Anything is possible.</small>
                <ArrowUpRight size={16} />
              </button>
              <button onClick={() => onImport("document")}>
                <span>
                  <UploadCloud size={21} />
                </span>
                <strong>Upload a file</strong>
                <small>Your notes, now all in one place.</small>
                <ArrowUpRight size={16} />
              </button>
              <button onClick={() => onImport("scan")}>
                <span>
                  <Camera size={21} />
                </span>
                <strong>Scan your notes</strong>
                <small>From paper to your pocket.</small>
                <ArrowUpRight size={16} />
              </button>
            </div>
          </section>
          <section className={s.section}>
            <div className={s.sectionHeading}>
              <h2>Your courses</h2>
              <Link className={s.textLink} to="/settings">
                Manage <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className={s.courseTiles}>
              {state.courses.map((c) => (
                <Link to={`/courses/${c.id}`} key={c.id}>
                  <span
                    className={s.courseDot}
                    style={{ background: c.color }}
                  />
                  <div>
                    <strong>{c.code}</strong>
                    <small>{c.name}</small>
                  </div>
                  <ArrowUpRight size={15} />
                </Link>
              ))}
            </div>
          </section>
        </div>
        <aside className={s.dashboardAside}>
          <section className={s.panel}>
            <div className={s.sectionHeading}>
              <h2>On the horizon</h2>
              <Link
                className={s.iconButton}
                aria-label="Open schedule"
                to="/schedule"
              >
                <ArrowUpRight size={18} />
              </Link>
            </div>
            <div className={s.miniWeek}>
              {Array.from({ length: 7 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - d.getDay() + i);
                return (
                  <Link
                    key={i}
                    to={`/schedule?date=${dateKey(d)}`}
                    className={dateKey(d) === today ? s.weekToday : ""}
                  >
                    <span>
                      {d.toLocaleDateString(undefined, { weekday: "narrow" })}
                    </span>
                    <strong>{d.getDate()}</strong>
                    <i />
                  </Link>
                );
              })}
            </div>
            <div className={s.smallHeading}>
              <span>TODAY</span>
              <span>{day.length} classes</span>
            </div>
            {day.length ? (
              day.map((e) => (
                <EventRow key={e.id} event={e} onClick={setEvent} />
              ))
            ) : (
              <Empty title="Nothing on the calendar">
                A little room to breathe.
              </Empty>
            )}
            <Link className={s.textLink} to="/schedule">
              See your full schedule <ArrowRight size={15} />
            </Link>
          </section>
          <section className={s.panel}>
            <div className={s.sectionHeading}>
              <h2>A little heads-up</h2>
              <span className={s.count}>{deadlines.length}</span>
            </div>
            {deadlines.map((e) => (
              <button
                className={s.deadline}
                key={e.id}
                onClick={() => setEvent(e)}
              >
                <span className={s.deadlineIcon}>
                  <FileText size={17} />
                </span>
                <span>
                  <strong>{e.title}</strong>
                  <small>
                    {state.courses.find((c) => c.id === e.courseId)?.code} ·{" "}
                    {e.kind}
                  </small>
                  <em>
                    {new Date(e.date + "T12:00:00").toLocaleDateString(
                      undefined,
                      { month: "short", day: "numeric" },
                    )}{" "}
                    · {e.time}
                  </em>
                </span>
              </button>
            ))}
          </section>
          <div className={s.quietNote}>
            <Sparkles size={20} />
            <p>
              You don’t have to have it all figured out.
              <br />
              <strong>Just start with one note.</strong>
            </p>
          </div>
        </aside>
      </div>
      {event && (
        <EventDialog event={event} onClose={() => setEvent(undefined)} />
      )}
    </>
  );
}
