import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import {
  checkRepeat,
  expandRepeats,
} from "../services/recurrence";
import { useApp, useHoldRefresh } from "../app/context";
import {
  Modal,
  PageHeading,
  Sheet,
  Spread,
  WeekStrip,
  EventRow,
  Empty,
  formatEventTime,
  countOf,
} from "../shared/ui";
import { dateKey } from "../services/fixtures";
import {
  isClass,
  editableCourses,
  type CourseEvent,
  type EventKind,
  type Note,
} from "../domain";
import s from "../shared/ui.module.css";
import css from "./schedule.module.css";
// Shared classes this screen's own rules also name (see schedule.module.css), applied together.
const both = { actions: `${s.actions} ${css.actions}` };

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const SHORT_WEEKDAYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

function repeatSummary(event: CourseEvent) {
  if (!event.repeat) return "";

  const frequency =
    event.repeat.every === 1
      ? "every week"
      : "every 2 weeks";

  const days = event.repeat.days
    .map((day) => SHORT_WEEKDAYS[day])
    .join(", ");

  const until = new Date(
    `${event.repeat.until}T12:00:00`,
  ).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `Repeats ${frequency} on ${days} until ${until}`;
}

function weekdayOf(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(
    Date.UTC(year, month - 1, day),
  ).getUTCDay();
}

export function EventDialog({
  event,
  date,
  occurrence,
  onClose,
}: {
  event?: CourseEvent;
  date?: string;
  // Card 245: the day of the meeting that was opened (a weekly event has many).
  occurrence?: string;
  onClose: () => void;
}) {
  const { state, repo, refresh } = useApp();
  useHoldRefresh(true); // open form: the background re-read waits until it closes

  const [value, setValue] = useState<CourseEvent>(
    event || {
      id: "",
      title: "",
      courseId: editableCourses(state.courses)[0]?.id || "",
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
  const [confirming, setConfirming] = useState(false);
  const [attach, setAttach] = useState<string[]>([]);
  const [createdId, setCreatedId] = useState("");

  const update = (
    key: keyof CourseEvent,
    v: string,
  ) => setValue({ ...value, [key]: v });

  function setRepeat(
    every: "" | "1" | "2",
  ) {
    if (!every) {
      const {
        repeat: _repeat,
        ...withoutRepeat
      } = value;

      setValue(withoutRepeat);
      return;
    }

    setValue({
      ...value,
      repeat: {
        every: Number(every) as 1 | 2,
        days: value.repeat?.days.length
          ? value.repeat.days
          : [weekdayOf(value.date)],
        until:
          value.repeat?.until || value.date,
      },
    });
  }

  function toggleRepeatDay(day: number) {
    if (!value.repeat) return;

    const days = value.repeat.days.includes(
      day,
    )
      ? value.repeat.days.filter(
          (selected) => selected !== day,
        )
      : [...value.repeat.days, day].sort(
          (a, b) => a - b,
        );

    setValue({
      ...value,
      repeat: {
        ...value.repeat,
        days,
      },
    });
  }

  // Shared schedules require explicit edit access; deletion always stays with the owner.
  if (event?.sharedBy && event.permission !== "edit") return <SharedEventDetails event={event} onClose={onClose} />;

  return (
    <Modal
      title={
        event
          ? "Event details"
          : "Make room for what’s next"
      }
      description="Classes, deadlines, and everything in between."
      onClose={onClose}
    >
      <form
        className={s.form}
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");

          if (value.repeat) {
            const repeatError = checkRepeat(
              value.repeat,
              value.date,
            );

            if (repeatError) {
              setError(repeatError);
              return;
            }
          }

          setBusy(true);

          try {
            // Card 245: chosen notes attach to the first meeting; a retry after a failed attach skips the save.
            const id = createdId || (await repo.schedule.save(value)).id;
            if (!event) setCreatedId(id);
            if (!event) for (const noteId of attach) await repo.notes.link(noteId, id, value.date);
            await refresh();
            onClose();
          } catch (e) {
            setError(
              (e as Error).message,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && (
          <p
            role="alert"
            className={s.error}
          >
            {error}
          </p>
        )}

        {event?.repeat && (
          <p className={s.notice}>
            {repeatSummary(event)}
          </p>
        )}

        <label>
          Title
          <input
            autoFocus
            required
            value={value.title}
            onChange={(e) =>
              update(
                "title",
                e.target.value,
              )
            }
          />
        </label>

        <div className={css.fieldRow}>
          <label>
            Course
            <select
              disabled={Boolean(event?.sharedBy)}
              value={value.courseId}
              onChange={(e) =>
                update(
                  "courseId",
                  e.target.value,
                )
              }
            >
              <option value="">
                Personal
              </option>

              {/* Include shared courses only when this student has edit access. */}
              {editableCourses(state.courses).map(
                (c) => (
                  <option
                    key={c.id}
                    value={c.id}
                  >
                    {c.code}{c.sharedBy ? ` (${c.sharedBy.name})` : ""}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            Event type
            <select
              value={value.kind}
              onChange={(e) =>
                update(
                  "kind",
                  e.target
                    .value as EventKind,
                )
              }
            >
              {[
                "lecture",
                "recitation",
                "lab",
                "assignment",
                "quiz",
                "exam",
                "deadline",
                "other",
              ].map((k) => (
                <option key={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={css.fieldRow}>
          <label>
            Date
            <input
              required
              type="date"
              value={value.date}
              onChange={(e) =>
                update(
                  "date",
                  e.target.value,
                )
              }
            />
          </label>

          <label>
            Time
            <input
              type="time"
              value={value.time}
              onChange={(e) =>
                update(
                  "time",
                  e.target.value,
                )
              }
            />
          </label>
        </div>

        <label>
          Repeats
          <select
            value={
              value.repeat
                ? String(
                    value.repeat.every,
                  )
                : ""
            }
            onChange={(e) =>
              setRepeat(
                e.target.value as
                  | ""
                  | "1"
                  | "2",
              )
            }
          >
            <option value="">
              Does not repeat
            </option>
            <option value="1">
              Every week
            </option>
            <option value="2">
              Every 2 weeks
            </option>
          </select>
        </label>

        {value.repeat && (
          <>
            <div
              role="group"
              aria-label="Repeat days"
              className={`${s.dayToggles} ${css.dayToggles}`}
            >
              {WEEKDAYS.map(
                (day, number) => (
                  <button
                    key={day}
                    type="button"
                    aria-label={day}
                    aria-pressed={
                      value.repeat?.days.includes(
                        number,
                      ) ?? false
                    }
                    onClick={() =>
                      toggleRepeatDay(
                        number,
                      )
                    }
                  >
                    {day[0]}
                  </button>
                ),
              )}
            </div>

            <label>
              Ends on
              <input
                required
                type="date"
                value={
                  value.repeat.until
                }
                onChange={(e) =>
                  setValue({
                    ...value,
                    repeat: {
                      ...value.repeat!,
                      until:
                        e.target.value,
                    },
                  })
                }
              />
            </label>
          </>
        )}

        <label>
          Location{" "}
          <span
            className={`${s.muted} ${css.optional}`}
          >
            optional
          </span>
          <input
            value={value.location}
            onChange={(e) =>
              update(
                "location",
                e.target.value,
              )
            }
          />
        </label>

        <label>
          Description
          <textarea
            rows={3}
            value={
              value.description
            }
            onChange={(e) =>
              update(
                "description",
                e.target.value,
              )
            }
          />
        </label>

        {!event && (
          <fieldset className={css.attach}>
            <legend>
              Attach notes{" "}
              <span className={`${s.muted} ${css.optional}`}>optional</span>
            </legend>
            <NotePicker
              chosen={attach}
              onPick={(n) => setAttach((list) => list.includes(n.id) ? list.filter((x) => x !== n.id) : [...list, n.id])}
            />
          </fieldset>
        )}

        {event?.source ===
          "imported" && (
          <p
            className={s.notice}
          >
            Imported from your
            syllabus. You can update
            these details.
            {event.seriesId &&
              " Changes apply to this meeting only."}
          </p>
        )}

        {value.kind ===
          "lecture" &&
          value.courseId && (
            <Link
              className={s.textLink}
              to={`/courses/${value.courseId}?lecture=${value.date}`}
              onClick={onClose}
            >
              Open lecture notes{" "}
              <ArrowUpRight
                size={16}
              />
            </Link>
          )}

        <div className={`${both.actions} ${event ? css.splitActions : ""}`}>
          {event && !event.sharedBy && (
            <button
              type="button"
              className={
                s.dangerOutline
              }
              disabled={busy}
              onClick={() =>
                setConfirming(true)
              }
            >
              Delete event
            </button>
          )}

          <button
            className={s.primary}
            disabled={busy}
          >
            {busy
              ? "Saving…"
              : event
                ? "Save changes"
                : "Create event"}
          </button>
        </div>
      </form>

      {event && !event.sharedBy && (
        <EventNotes event={event} date={occurrence ?? event.date} onOpen={onClose} />
      )}

      {event && !event.sharedBy && confirming && (
        <DeleteEventDialog
          title={event.title}
          repeats={Boolean(
            event.seriesId || event.repeat,
          )}
          deleteAllOnly={Boolean(
            event.repeat,
          )}
          repeatEvery={
            event.repeat?.every
          }
          onDelete={async (
            wholeSeries,
          ) => {
            await repo.schedule.remove(
              event,
              wholeSeries,
            );
            await refresh();
            onClose();
          }}
          onClose={() =>
            setConfirming(false)
          }
        />
      )}
    </Modal>
  );
}

// Card 245: a searchable list of the student's own notes. `chosen` marks the ones already picked.
function NotePicker({ chosen, exclude = [], onPick, reveal }: {
  chosen?: string[];
  exclude?: string[];
  onPick: (note: Note) => void;
  // Scroll the picker into view when it opens (it sits below the fold of the event window).
  reveal?: boolean;
}) {
  const { repo } = useApp();
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    let current = true;
    repo.notes.list({ q: q.trim() || undefined }).then(
      (list) => current && setNotes(list.filter((n) => !n.sharedBy)),
      (e: Error) => current && setFailed(e.message),
    );
    return () => { current = false; };
  }, [repo, q]);
  const shown = (notes ?? []).filter((n) => !exclude.includes(n.id));
  return (
    <div className={css.picker} ref={(el) => { if (reveal) el?.scrollIntoView({ block: "nearest" }); }}>
      <input type="search" aria-label="Search your notes" placeholder="Search your notes" value={q}
        onChange={(e) => setQ(e.target.value)} />
      {failed && <p role="alert" className={s.error}>{failed}</p>}
      {notes && !shown.length && <p className={s.muted}>No notes to choose.</p>}
      <ul>
        {shown.map((n) => (
          <li key={n.id}>
            <button type="button" aria-pressed={chosen ? chosen.includes(n.id) : undefined} onClick={() => onPick(n)}>
              <strong>{n.title}</strong>
              {n.excerpt && <span>{n.excerpt}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Card 245: the notes attached to one meeting of an event, with link, new and unlink.
function EventNotes({ event, date, onOpen }: { event: CourseEvent; date: string; onOpen: () => void }) {
  const { repo, refresh } = useApp();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    repo.notes.list({ event: event.id, eventDate: date }).then(setNotes, (e: Error) => { setNotes([]); setError(e.message); });
  }, [repo, event.id, date]);

  async function run(work: () => Promise<void>) {
    setError("");
    setBusy(true);
    try { await work(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const open = (id: string) => { onOpen(); navigate(`/notes/${id}`); };

  return (
    <section className={css.notes} aria-label="Notes">
      <h3>Notes</h3>
      {error && <p role="alert" className={s.error}>{error}</p>}
      {notes && !notes.length && <p className={s.muted}>No notes are attached to this meeting yet.</p>}
      <ul className={css.noteList}>
        {(notes ?? []).map((n) => (
          <li key={n.id}>
            <button type="button" className={css.noteOpen} onClick={() => open(n.id)}>
              <strong>{n.title}</strong>
              {n.excerpt && <span>{n.excerpt}</span>}
            </button>
            <button type="button" className={s.quiet} disabled={busy} aria-label={`Unlink ${n.title}`}
              onClick={() => run(async () => {
                await repo.notes.link(n.id, null, date);
                setNotes((list) => (list ?? []).filter((x) => x.id !== n.id));
              })}>
              Unlink
            </button>
          </li>
        ))}
      </ul>
      <div className={s.actions}>
        <button type="button" className={s.secondary} aria-expanded={picking} onClick={() => setPicking(!picking)}>
          Link a note
        </button>
        <button type="button" className={s.secondary} disabled={busy}
          onClick={() => run(async () => {
            const note = await repo.notes.create({ title: event.title, courseId: event.courseId, lectureDate: date });
            await repo.notes.link(note.id, event.id, date);
            await refresh();
            open(note.id);
          })}>
          New note for this event
        </button>
      </div>
      {picking && (
        <NotePicker reveal exclude={(notes ?? []).map((n) => n.id)}
          onPick={(n) => run(async () => {
            const linked = await repo.notes.link(n.id, event.id, date);
            setNotes((list) => [...(list ?? []), linked]);
          })} />
      )}
    </section>
  );
}

// Card 144: what a classmate sees for an event in a course shared with them (card 143): its details, read only.
function SharedEventDetails({
  event,
  onClose,
}: {
  event: CourseEvent;
  onClose: () => void;
}) {
  const { state } = useApp();
  const course = state.courses.find((c) => c.id === event.courseId);
  const when = new Date(`${event.date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  const rows: [string, string][] = [
    ["Title", event.title],
    ["Course", course?.code ?? ""],
    ["Event type", event.kind],
    ["Date", when],
    ["Time", event.time ? formatEventTime(event.time) : "All day"],
    ["Location", event.location],
    ["Description", event.description],
  ];
  return (
    <Modal
      title="Event details"
      description={`Shared by ${event.sharedBy!.name}. You can view this event.`}
      onClose={onClose}
    >
      {event.repeat && <p className={s.notice}>{repeatSummary(event)}</p>}
      <dl className={css.sharedDetails}>
        {rows.filter(([, value]) => value).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

// Card 173: confirms deleting one event. Cancel, Escape, and the X keep it and return to Event details.
// Card 48: a weekly class asks whether to delete this one meeting, such as a cancelled class, or all of them.
function DeleteEventDialog({
  title,
  repeats,
  deleteAllOnly,
  repeatEvery,
  onDelete,
  onClose,
}: {
  title: string;
  repeats: boolean;
  deleteAllOnly: boolean;
  repeatEvery?: 1 | 2;
  onDelete: (
    wholeSeries: boolean,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [deleting, setDeleting] =
    useState<
      "" | "one" | "all"
    >("");

  const [error, setError] =
    useState("");

  const pending = useRef(false);

  async function confirm(
    wholeSeries: boolean,
  ) {
    if (pending.current) return;

    pending.current = true;

    setDeleting(
      wholeSeries
        ? "all"
        : "one",
    );

    setError("");

    try {
      await onDelete(
        wholeSeries,
      );
    } catch {
      pending.current = false;
      setDeleting("");
      setError(
        "Could not delete this event. Please try again.",
      );
    }
  }

  return (
    <Modal
      title="Delete this event?"
      description={
        deleteAllOnly
          ? `${title} ${
              repeatEvery === 2
                ? "repeats every 2 weeks"
                : "repeats every week"
            }. Deleting it will remove the whole series.`
          : repeats
            ? `${title} repeats every week. Delete just this one, or all of them?`
            : `${title} will be removed from your schedule.`
      }
      dismissible={!deleting}
      onClose={onClose}
    >
      {error && (
        <p
          className={s.error}
          role="alert"
        >
          {error}
        </p>
      )}

      <div className={both.actions}>
        <Dialog.Close
          className={s.secondary}
          disabled={Boolean(
            deleting,
          )}
        >
          Cancel
        </Dialog.Close>

        {deleteAllOnly ? (
          <button
            className={s.danger}
            disabled={Boolean(
              deleting,
            )}
            onClick={() =>
              confirm(true)
            }
          >
            {deleting === "all"
              ? "Deleting…"
              : "Delete all"}
          </button>
        ) : repeats ? (
          <>
            <button
              className={
                s.dangerOutline
              }
              disabled={Boolean(
                deleting,
              )}
              onClick={() =>
                confirm(false)
              }
            >
              {deleting === "one"
                ? "Deleting…"
                : "Delete this one"}
            </button>

            <button
              className={s.danger}
              disabled={Boolean(
                deleting,
              )}
              onClick={() =>
                confirm(true)
              }
            >
              {deleting === "all"
                ? "Deleting…"
                : "Delete all"}
            </button>
          </>
        ) : (
          <button
            className={s.danger}
            disabled={Boolean(
              deleting,
            )}
            onClick={() =>
              confirm(false)
            }
          >
            {deleting
              ? "Deleting…"
              : "Delete event"}
          </button>
        )}
      </div>
    </Modal>
  );
}

const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
};
const hourName = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
const BLOCK = 60; // events carry a start time only, so a block on the rail is one hour long

// shortcut: lanes are worked out per day, so one busy hour narrows that whole day's blocks; revisit if days get crowded.
function laneOut(list: CourseEvent[]) {
  const ends: number[] = [];
  const lane = list.map((e) => {
    const from = minutesOf(e.time);
    let i = ends.findIndex((end) => end <= from);
    if (i < 0) i = ends.push(0) - 1;
    ends[i] = from + BLOCK;
    return i;
  });
  return { lane, lanes: Math.max(1, ends.length) };
}

// The current time, refreshed each minute, for the Now ribbon.
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
const byTime = (a: CourseEvent, b: CourseEvent) => a.time.localeCompare(b.time);

export function Schedule() {
  const { state } = useApp();
  const [params, setParams] = useSearchParams();
  const now = useNow();
  const today = dateKey(now);

  const raw = params.get("date");
  const selected =
    raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !isNaN(Date.parse(raw)) ? raw : today;
  const view = params.get("view") === "month" ? "month" : "week";
  const date = new Date(selected + "T12:00:00");

  const [event, setEvent] = useState<CourseEvent | null | undefined>();
  const [occurrence, setOccurrence] = useState<string>();

  const set = (k: string, v: string) =>
    setParams((p) => {
      p.set(k, v);
      return p;
    });

  // The 6-week month grid always contains the selected day's week, so one expansion serves both views.
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i - first.getDay()));
  const visibleEvents = state.events.flatMap((e) =>
    expandRepeats(e, dateKey(days[0]), dateKey(days[days.length - 1])),
  );
  const dayEvents = visibleEvents.filter((e) => e.date === selected);

  function openEvent(occurrence: CourseEvent) {
    const originalId = occurrence.repeatOf ?? occurrence.id;
    const original = state.events.find((e) => e.id === originalId);
    setOccurrence(occurrence.date);
    setEvent(original ?? occurrence);
  }

  function month(delta: number) {
    set("date", dateKey(new Date(date.getFullYear(), date.getMonth() + delta, 1)));
  }

  const colorOf = (e: CourseEvent) =>
    state.courses.find((c) => c.id === e.courseId)?.color ?? "var(--muted)";
  const codeOf = (e: CourseEvent) => state.courses.find((c) => c.id === e.courseId)?.code;

  // Week: seven columns on one hour rail. Untimed items and deadlines go to the strip above the rail.
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(date, i - date.getDay());
    const key = dateKey(d);
    const list = visibleEvents.filter((e) => e.date === key).sort(byTime);
    const timed = list.filter((e) => e.time && e.kind !== "deadline");
    return { d, key, strip: list.filter((e) => !timed.includes(e)), timed, ...laneOut(timed) };
  });
  const starts = week.flatMap((x) => x.timed.map((e) => minutesOf(e.time)));
  const fromHour = Math.min(8, ...starts.map((m) => Math.floor(m / 60)));
  const toHour = Math.min(24, Math.max(18, ...starts.map((m) => Math.ceil((m + BLOCK) / 60))));
  const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
  const nowAt = (now.getHours() * 60 + now.getMinutes()) / 60 - fromHour;
  const showNow = week.some((x) => x.key === today) && nowAt >= 0 && nowAt < toHour - fromHour;
  const weekCount = week.reduce((n, x) => n + x.strip.length + x.timed.length, 0);

  const agenda = (
    <div className={css.agendaPage}>
      <div className={css.agendaHead}>
        <h2>
          {date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}
        </h2>
        <p>Your day at a glance</p>
      </div>

      <label className={css.mobileOnly}>
        Jump to date
        <input
          type="date"
          value={selected}
          onChange={(e) => e.target.value && set("date", e.target.value)}
        />
      </label>

      {dayEvents.length ? (
        dayEvents.map((e) => <EventRow key={`${e.id}-${e.date}`} event={e} onClick={openEvent} />)
      ) : (
        <Empty title="A little breathing room">
          No events on this day. Make it yours.
          {state.events.length === 0 && (
            <>
              {" "}
              {state.courses.length === 0
                ? "Add a course first and its classes land here."
                : "Upload a syllabus and its classes land here."}{" "}
              <Link to="/courses">Go to Courses</Link>
            </>
          )}
        </Empty>
      )}

      <button className={s.textLink} onClick={() => setEvent(null)}>
        <Plus size={16} /> Add something to this day
      </button>
    </div>
  );

  const monthPage = (
    <div className={css.monthPage}>
      <div className={css.monthHead}>
        <h2>{date.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>

        <div className={both.actions}>
          <button className={s.secondary} onClick={() => set("date", today)}>
            Today
          </button>
          <button className={s.iconButton} aria-label="Previous month" onClick={() => month(-1)}>
            <ChevronLeft size={18} />
          </button>
          <button className={s.iconButton} aria-label="Next month" onClick={() => month(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className={css.calendar}>
        {SHORT_WEEKDAYS.map((d) => (
          <span className={css.weekday} key={d}>
            {d}
          </span>
        ))}

        {days.map((d) => {
          const key = dateKey(d);

          // A square fits only two events, so exams and due items go ahead of classes (card 48).
          const events = visibleEvents
            .filter((e) => e.date === key)
            .sort((a, b) => Number(isClass(a.kind)) - Number(isClass(b.kind)));

          return (
            <button
              key={key}
              aria-label={`${d.toDateString()}, ${countOf(events.length, "event")}`}
              aria-pressed={key === selected}
              className={`${css.day} ${key === selected ? css.selectedDay : ""} ${
                d.getMonth() !== date.getMonth() ? css.outside : ""
              }`}
              onClick={() => set("date", key)}
            >
              <span className={key === today ? css.todayNumber : ""}>{d.getDate()}</span>

              {events.slice(0, 2).map((e) => (
                <small key={e.id}>
                  <i style={{ background: colorOf(e) }} />
                  {e.time ? `${formatEventTime(e.time)} ` : ""}
                  {e.kind}: {e.title}
                </small>
              ))}

              {events.length > 2 && <small>+{events.length - 2} more</small>}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <PageHeading
        eyebrow="A little perspective"
        title="Your schedule"
        description="Everything coming up. All in one place."
        actions={
          <>
            <div className={s.segment} role="group" aria-label="Schedule view">
              {(["week", "month"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  className={view === v ? s.activeButton : ""}
                  onClick={() => set("view", v)}
                >
                  {v === "week" ? "Week" : "Month"}
                </button>
              ))}
            </div>
            <button className={s.primary} onClick={() => setEvent(null)}>
              <Plus size={18} /> Add event
            </button>
          </>
        }
      />

      {view === "month" ? (
        <Spread label="Month" left={monthPage} right={agenda} />
      ) : (
        <Sheet label="Week" className={css.weekSheet}>
          <div className={css.strip}>
            <WeekStrip
              date={selected}
              today={today}
              selected={selected}
              marked={week.filter((x) => x.strip.length + x.timed.length > 0).map((x) => x.key)}
              onPrev={() => set("date", dateKey(addDays(date, -7)))}
              onNext={() => set("date", dateKey(addDays(date, 7)))}
              onToday={() => set("date", today)}
              onSelect={(day) => set("date", day)}
            />
          </div>

          {weekCount === 0 && (
            <Empty title="A little breathing room">
              Nothing planned this week. Make it yours.
              {state.events.length === 0 && (
                <>
                  {" "}
                  {state.courses.length === 0
                    ? "Add a course first and its classes land here."
                    : "Upload a syllabus and its classes land here."}{" "}
                  <Link to="/courses">Go to Courses</Link>
                </>
              )}
            </Empty>
          )}

          <div className={css.planner} style={{ "--rows": hours.length } as CSSProperties}>
            {week.some((x) => x.strip.length > 0) && (
              <div className={`${css.row} ${css.stripRow}`}>
                <span className={css.railLabel}>All day</span>
                {week.map((x) => (
                  <div
                    key={x.key}
                    className={css.stripCell}
                    data-day={x.key}
                    data-selected={x.key === selected || undefined}
                  >
                    {x.strip.map((e) => (
                      <button
                        key={`${e.id}-${e.date}`}
                        type="button"
                        className={css.pill}
                        style={{ "--c": colorOf(e) } as CSSProperties}
                        onClick={() => openEvent(e)}
                      >
                        {e.time && <b>{formatEventTime(e.time)}</b>} {e.title}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className={css.row}>
              <div className={css.rail} aria-hidden="true">
                {hours.map((h) => (
                  <span key={h} style={{ "--t": h - fromHour } as CSSProperties}>
                    {hourName(h)}
                  </span>
                ))}
                {showNow && (
                  <span className={css.nowFlag} style={{ "--t": nowAt } as CSSProperties}>
                    {formatEventTime(`${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`)}
                  </span>
                )}
              </div>

              {week.map((x) => (
                <div
                  key={x.key}
                  className={css.col}
                  role="group"
                  aria-label={x.d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  data-day={x.key}
                  data-today={x.key === today || undefined}
                  data-selected={x.key === selected || undefined}
                >
                  {showNow && x.key === today && (
                    <i className={css.now} style={{ "--t": nowAt } as CSSProperties} aria-hidden="true" />
                  )}

                  {x.timed.map((e, i) => (
                    <button
                      key={`${e.id}-${e.date}`}
                      type="button"
                      className={css.block}
                      style={
                        {
                          "--c": colorOf(e),
                          "--t": minutesOf(e.time) / 60 - fromHour,
                          "--lane": x.lane[i],
                          "--lanes": x.lanes,
                        } as CSSProperties
                      }
                      onClick={() => openEvent(e)}
                    >
                      <b>{formatEventTime(e.time)}</b>{" "}
                      <span>{e.title}</span>{" "}
                      <small>
                        {e.kind}
                        {codeOf(e) ? ` · ${codeOf(e)}` : ""}
                      </small>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Sheet>
      )}

      {event !== undefined && (
        <EventDialog
          event={event || undefined}
          date={selected}
          occurrence={occurrence}
          onClose={() => setEvent(undefined)}
        />
      )}
    </>
  );
}
