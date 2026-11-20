import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck } from "lucide-react";
import { useApp, useHoldRefresh } from "../app/context";
import { Modal, formatEventTime } from "../shared/ui";
import { dateKey } from "../services/fixtures";
import { expandRepeats } from "../services/recurrence";
import type { Note } from "../domain";
import css from "./link-event.module.css";
import s from "../shared/ui.module.css";

const day = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
const shift = (date: string, days: number) => dateKey(new Date(new Date(`${date}T12:00:00`).getTime() + days * 86400000));

// Card 244: the linked class and day as a chip (opens the Schedule at that day), with the owner's Link/Change/Unlink.
// Used in the note's Details and on each card of the notes list; `onLinked` receives the note the server returns.
export function LinkControls({ note, canLink, compact = false, onLinked }: { note: Note; canLink: boolean; compact?: boolean; onLinked: (note: Note) => void }) {
  const { repo, state } = useApp();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const event = note.eventId ? state.events.find((e) => e.id === note.eventId) : undefined;
  async function save(eventId: string | null, date: string) {
    setBusy(true);
    setError("");
    try {
      onLinked(await repo.notes.link(note.id, eventId, date));
      setPicking(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={css.row}>
      {note.eventId && note.eventDate && (
        <Link className={css.chip} to={`/schedule?date=${note.eventDate}`} title="Open this day in the Schedule">
          <CalendarCheck size={14} aria-hidden="true" />
          <span>{event?.title ?? "Linked class"} · {day(note.eventDate)}</span>
        </Link>
      )}
      {canLink && (
        <>
          {!(compact && note.eventId) && <button type="button" className={`${s.secondary} ${css.action}`} disabled={busy} onClick={() => { setError(""); setPicking(true); }}>
            {note.eventId ? "Change class" : "Link to a class…"}
          </button>}
          {note.eventId && (
            <button type="button" className={`${s.secondary} ${css.action}`} disabled={busy} onClick={() => save(null, note.eventDate || note.lectureDate || dateKey())}>
              Unlink
            </button>
          )}
        </>
      )}
      {error && !picking && <p role="alert" className={css.error}>{error}</p>}
      {picking && <Picker note={note} busy={busy} error={error} onPick={save} onClose={() => setPicking(false)} />}
    </div>
  );
}

// Own events (a classmate's shared event cannot be linked), each meeting on its own date, nearest the note's day first.
function Picker({ note, busy, error, onPick, onClose }: { note: Note; busy: boolean; error: string; onPick: (eventId: string, date: string) => void; onClose: () => void }) {
  const { state } = useApp();
  useHoldRefresh(true);
  const [all, setAll] = useState(!note.courseId);
  const around = note.lectureDate || dateKey();
  const days = useMemo(() => {
    const byDate = new Map<string, ReturnType<typeof expandRepeats>>();
    for (const e of state.events) {
      if (e.sharedBy || (!all && e.courseId && e.courseId !== note.courseId)) continue;
      for (const o of expandRepeats(e, shift(around, -60), shift(around, 90))) byDate.set(o.date, [...(byDate.get(o.date) ?? []), { ...o, id: e.id }]);
    }
    const gap = (d: string) => Math.abs(Date.parse(d) - Date.parse(around));
    return [...byDate].sort((a, b) => gap(a[0]) - gap(b[0]) || a[0].localeCompare(b[0]));
  }, [state.events, all, note.courseId, around]);
  return (
    <Modal title="Link to a class" description="Pick the class meeting this note belongs to." onClose={onClose}>
      {note.courseId && (
        <label className={css.all}>
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show every course
        </label>
      )}
      {error && <p role="alert" className={css.error}>{error}</p>}
      {days.length === 0 ? <p className={css.empty}>No class meetings found. Add one in the Schedule first.</p> : (
        <div className={css.days}>
          {days.map(([date, items]) => (
            <section key={date} aria-label={day(date)}>
              <h3>{day(date)}</h3>
              <ul>
                {items.map((e) => (
                  <li key={e.id}>
                    <button type="button" className={css.pick} disabled={busy} onClick={() => onPick(e.id, date)}>
                      <strong>{e.title}</strong>
                      <span>{state.courses.find((c) => c.id === e.courseId)?.code ?? ""}{e.time ? ` · ${formatEventTime(e.time)}` : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
