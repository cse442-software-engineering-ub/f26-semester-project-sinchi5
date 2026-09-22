import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, ArrowUpRight } from "lucide-react";
import { useApp } from "../app/context";
import { Modal, PageHeading, EventRow, Empty } from "../shared/ui";
import { dateKey } from "../services/fixtures";
import type { CourseEvent, EventKind } from "../domain";
import s from "../app/App.module.css";
export function EventDialog({
  event,
  date,
  onClose,
}: {
  event?: CourseEvent;
  date?: string;
  onClose: () => void;
}) {
  const { state, repo, refresh } = useApp();
  const [value, setValue] = useState<CourseEvent>(
    event || {
      id: "",
      title: "",
      courseId: state.courses[0]?.id || "",
      kind: "lecture",
      date: date || dateKey(),
      time: "10:00",
      location: "",
      description: "",
      source: "manual",
    },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (key: keyof CourseEvent, v: string) =>
    setValue({ ...value, [key]: v });
  return (
    <Modal
      title={event ? "Event details" : "Make room for what’s next"}
      description="Classes, deadlines, and everything in between."
      onClose={onClose}
    >
      <form
        className={s.form}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await repo.schedule.save(value);
            await refresh();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}
        <label>
          Title
          <input
            autoFocus
            required
            value={value.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </label>
        <div className={s.formRow}>
          <label>
            Course
            <select
              value={value.courseId}
              onChange={(e) => update("courseId", e.target.value)}
            >
              <option value="">Personal</option>
              {state.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            Event type
            <select
              value={value.kind}
              onChange={(e) => update("kind", e.target.value as EventKind)}
            >
              {[
                "lecture",
                "assignment",
                "quiz",
                "exam",
                "deadline",
                "other",
              ].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
        <div className={s.formRow}>
          <label>
            Date
            <input
              required
              type="date"
              value={value.date}
              onChange={(e) => update("date", e.target.value)}
            />
          </label>
          <label>
            Time
            <input
              type="time"
              value={value.time}
              onChange={(e) => update("time", e.target.value)}
            />
          </label>
        </div>
        <label>
          Location <span className={s.muted}>optional</span>
          <input
            value={value.location}
            onChange={(e) => update("location", e.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            rows={3}
            value={value.description}
            onChange={(e) => update("description", e.target.value)}
          />
        </label>
        {event?.source === "imported" && (
          <p className={s.notice}>
            Imported from your syllabus. You can update these details.
          </p>
        )}
        {value.kind === "lecture" && value.courseId && (
          <Link
            className={s.textLink}
            to={`/courses/${value.courseId}?lecture=${value.date}`}
            onClick={onClose}
          >
            Open lecture notes <ArrowUpRight size={16} />
          </Link>
        )}
        <button className={s.primary} disabled={busy}>
          {busy ? "Saving…" : event ? "Save changes" : "Create event"}
        </button>
      </form>
    </Modal>
  );
}
export function Schedule() {
  const { state } = useApp();
  const [params, setParams] = useSearchParams();
  const raw = params.get("date");
  const selected =
    raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !isNaN(Date.parse(raw))
      ? raw
      : dateKey();
  const date = new Date(selected + "T12:00:00");
  const [event, setEvent] = useState<CourseEvent | null | undefined>();
  const view = params.get("view") || "agenda";
  const set = (k: string, v: string) =>
    setParams((p) => {
      p.set(k, v);
      return p;
    });
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const dayEvents = state.events.filter((e) => e.date === selected);
  function month(delta: number) {
    set(
      "date",
      dateKey(new Date(date.getFullYear(), date.getMonth() + delta, 1)),
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="A little perspective"
        title="Your schedule"
        description="Everything coming up. All in one place."
        actions={
          <button className={s.primary} onClick={() => setEvent(null)}>
            <Plus size={18} /> Add event
          </button>
        }
      />
      <div className={s.scheduleLayout}>
        <section
          className={`${s.panel} ${s.calendarPanel} ${view === "agenda" ? s.mobileHide : ""}`}
        >
          <div className={s.sectionHeading}>
            <h2>
              {date.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <div className={s.actions}>
              <button
                className={s.secondary}
                onClick={() => set("date", dateKey())}
              >
                Today
              </button>
              <button
                className={s.iconButton}
                aria-label="Previous month"
                onClick={() => month(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className={s.iconButton}
                aria-label="Next month"
                onClick={() => month(1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className={s.calendar}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <span className={s.weekday} key={d}>
                {d}
              </span>
            ))}
            {days.map((d) => {
              const key = dateKey(d);
              const events = state.events.filter((e) => e.date === key);
              return (
                <button
                  key={key}
                  aria-label={`${d.toDateString()}, ${events.length} events`}
                  aria-pressed={key === selected}
                  className={`${s.day} ${key === selected ? s.selectedDay : ""} ${d.getMonth() !== date.getMonth() ? s.outside : ""}`}
                  onClick={() => set("date", key)}
                >
                  <span className={key === dateKey() ? s.todayNumber : ""}>
                    {d.getDate()}
                  </span>
                  {events.slice(0, 2).map((e) => (
                    <small key={e.id}>
                      <i
                        style={{
                          background: state.courses.find(
                            (c) => c.id === e.courseId,
                          )?.color,
                        }}
                      />
                      {e.kind}: {e.title}
                    </small>
                  ))}
                  {events.length > 2 && (
                    <small>+{events.length - 2} more</small>
                  )}
                </button>
              );
            })}
          </div>
        </section>
        <section className={`${s.panel} ${s.agenda}`}>
          <div className={s.sectionHeading}>
            <div>
              <span className={s.eyebrow}>Your day at a glance</span>
              <h2>
                {date.toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                })}
              </h2>
            </div>
            <button
              className={`${s.secondary} ${s.mobileOnly}`}
              onClick={() =>
                set("view", view === "agenda" ? "month" : "agenda")
              }
            >
              {view === "agenda" ? "Calendar" : "Agenda"}
            </button>
          </div>
          <label className={s.mobileOnly}>
            Jump to date
            <input
              type="date"
              value={selected}
              onChange={(e) => e.target.value && set("date", e.target.value)}
            />
          </label>
          {dayEvents.length ? (
            dayEvents.map((e) => (
              <EventRow key={e.id} event={e} onClick={setEvent} />
            ))
          ) : (
            <Empty title="A little breathing room">
              No events on this day. Make it yours.
            </Empty>
          )}
          <button className={s.textLink} onClick={() => setEvent(null)}>
            <Plus size={16} /> Add something to this day
          </button>
        </section>
      </div>
      {event !== undefined && (
        <EventDialog
          event={event || undefined}
          date={selected}
          onClose={() => setEvent(undefined)}
        />
      )}
    </>
  );
}
