import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, FileText, Camera, UploadCloud, ArrowUpRight, MapPin } from "lucide-react";
import { useApp } from "../app/context";
import { PageHeading, Spread, Chip, WeekStrip, Empty, formatEventTime } from "../shared/ui";
import { dateKey } from "../services/fixtures";
import { weekAhead, comingUp } from "../services/upcoming";
import { notePreview } from "../services/noteText";
import { expandRepeats } from "../services/recurrence";
import { EventDialog } from "./schedule";
import { type CourseEvent, type UploadKind, isClass, isDue } from "../domain";
import css from "./dashboard.module.css";
import s from "../shared/ui.module.css";

// Card 248: autumn gets a leaf, December to February a snowflake; other months nothing.
export function seasonGlyph(d: Date): "leaf" | "snow" | null {
  const m = d.getMonth();
  return m >= 8 && m <= 10 ? "leaf" : m === 11 || m <= 1 ? "snow" : null;
}
const SEASON_PATH = {
  leaf: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12",
  snow: "M2 12h20 M12 2v20 M20 16l-4-4 4-4 M4 8l4 4-4 4 M16 4l-4 4-4-4 M8 20l4-4 4 4",
};
// In memory only: a day that already celebrated an empty list does not do it again this session.
export const celebratedDays = new Set<string>();
const calm = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const PIECES = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  const r = 90 + (i % 3) * 30;
  return { "--dx": `${Math.round(Math.cos(a) * r)}px`, "--dy": `${Math.round(Math.sin(a) * r + 40)}px`, "--spin": `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg` } as React.CSSProperties;
});

const minutesOf = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
// Events carry a start time only; a class is drawn as one hour (shortcut: no real end time, until events get one).
const CLASS_MIN = 60;
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
const shiftDay = (key: string, days: number) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return dateKey(d);
};

export function Dashboard({ onImport, onCreate, onAddCourse }: {
  onImport: (kind: UploadKind) => void;
  onCreate: () => void;
  onAddCourse: () => void;
}) {
  const { state, repo, refresh } = useApp();
  const navigate = useNavigate();
  const [event, setEvent] = useState<CourseEvent>();
  const [now, setNow] = useState(() => new Date());
  const today = dateKey(now);
  // The strip's week and the day shown on the spread; Today resets both.
  const [shown, setShown] = useState(today);
  const [stripDate, setStripDate] = useState(today);
  const [starting, setStarting] = useState("");
  const [failure, setFailure] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const horizonDate = new Date(`${today}T12:00:00`);
  horizonDate.setFullYear(horizonDate.getFullYear() + 1);
  const horizon = dateKey(horizonDate);
  // Start a week early so the strip can show dots for days before today.
  const from = shiftDay(today, -7);
  const expandedEvents = state.events.flatMap((item) => expandRepeats(item, from, horizon));

  function openEvent(occurrence: CourseEvent) {
    const originalId = occurrence.repeatOf ?? occurrence.id;
    setEvent(state.events.find((item) => item.id === originalId) ?? occurrence);
  }
  const courseOf = (id: string) => state.courses.find((c) => c.id === id);

  const weekCount = weekAhead(expandedEvents, today).reduce((total, g) => total + g.events.length, 0);
  const isToday = shown === today;
  const day = expandedEvents.filter((item) => item.date === shown);
  const todayCount = expandedEvents.filter((item) => item.date === today).length;

  const [burst, setBurst] = useState(false);
  // Today has no "mark done" control, so the burst marks the first time a day has nothing left due.
  useEffect(() => {
    if (todayCount || !state.courses.length || celebratedDays.has(today) || calm()) return;
    celebratedDays.add(today);
    setBurst(true);
    const t = setTimeout(() => setBurst(false), 900);
    return () => clearTimeout(t);
  }, [todayCount, state.courses.length, today]);
  const season = seasonGlyph(now);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Hour rail: 8 AM to 6 PM, stretched to cover any earlier or later class. Due items never widen it:
  // one that falls inside the hours sits on the rail, the rest (a 23:59 deadline) become a Due pin in the strip.
  const span = (e: CourseEvent) => (isClass(e.kind) ? CLASS_MIN : 30);
  const timed = day.filter((e) => minutesOf(e.time) !== null);
  let startH = 8;
  let endH = 18;
  for (const e of timed.filter((x) => !isDue(x.kind))) {
    const m = minutesOf(e.time)!;
    startH = Math.min(startH, Math.floor(m / 60));
    endH = Math.max(endH, Math.ceil((m + span(e)) / 60));
  }
  endH = Math.min(endH, 24);
  const fits = (e: CourseEvent) => !isDue(e.kind) || (minutesOf(e.time)! >= startH * 60 && minutesOf(e.time)! + span(e) <= endH * 60);
  const onRail = timed.filter(fits);
  const allDay = day.filter((e) => minutesOf(e.time) === null || !fits(e));
  const total = (endH - startH) * 60;
  // Overlapping events sit side by side: greedy lanes, counted per cluster of overlapping events.
  const sorted = [...onRail].sort((a, b) => minutesOf(a.time)! - minutesOf(b.time)!);
  const laneEnds: number[] = [];
  const placed: { e: CourseEvent; m: number; lane: number; lanes: number }[] = [];
  let cluster = 0;
  let clusterEnd = 0;
  for (const e of sorted) {
    const m = minutesOf(e.time)!;
    if (m >= clusterEnd) { laneEnds.length = 0; cluster = placed.length; }
    let lane = laneEnds.findIndex((end) => end <= m);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = m + span(e);
    clusterEnd = Math.max(clusterEnd, m + span(e));
    placed.push({ e, m, lane, lanes: 1 });
    for (let i = cluster; i < placed.length; i++) placed[i].lanes = laneEnds.length;
  }
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const rel = Math.min(total, Math.max(0, nowMin - startH * 60));
  const parked = nowMin < startH * 60 ? "top" : nowMin > endH * 60 ? "bottom" : undefined;
  const nowLabel = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, "0")}`;
  const railRef = useRef<HTMLDivElement>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);
  // On a phone the rail scrolls inside the page; start with the ribbon near its top.
  useEffect(() => {
    const rail = railRef.current;
    const ribbon = ribbonRef.current;
    if (rail && ribbon && isToday) rail.scrollTop = Math.max(0, ribbon.offsetTop - 56);
  }, [isToday, startH, endH]);

  const dayName = new Date(`${shown}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  const dayDate = new Date(`${shown}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" });

  const classes = day.filter((e) => isClass(e.kind));
  const due = expandedEvents
    .filter((e) => !isClass(e.kind) && e.date >= today && e.date <= shiftDay(today, 6))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  // The next exams and projects past the week close the Due list ("in N days").
  const later = comingUp(expandedEvents, today, 2);
  const daysAway = (d: string) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);

  async function startNote(e: CourseEvent) {
    setStarting(e.id + e.date);
    setFailure("");
    try {
      const course = courseOf(e.courseId);
      const n = await repo.notes.create({ courseId: e.courseId, lectureDate: e.date, title: `${course?.code ?? "Class"} · ${new Date(`${e.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` });
      await refresh();
      navigate(`/notes/${n.id}`, { state: { newNote: true } });
    } catch (err) {
      setFailure((err as Error).message);
      setStarting("");
    }
  }

  const quick = [...state.notes]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);

  const left = (
    <div className={css.dayPage}>
      <div className={css.dayHead}>
        <h2 className={css.dayName}>{dayName}</h2>
        <p className={css.dayDate}>
          <span>{dayDate}</span>
          <span>
            {weekCount ? `${weekCount} ${weekCount === 1 ? "thing" : "things"} due this week` : "Nothing due this week."}
          </span>
        </p>
      </div>
      {allDay.length > 0 && (
        <ul className={css.allDay} aria-label="All day and due">
          {allDay.map((e) => (
            <li key={`${e.id}-${e.date}`}>
              <button type="button" onClick={() => openEvent(e)} style={{ "--c": courseOf(e.courseId)?.color } as React.CSSProperties}>
                <strong>{e.title}</strong>
                <span>{minutesOf(e.time) !== null && <b>Due {formatEventTime(e.time)} · </b>}{courseOf(e.courseId)?.code ?? "Personal"} · {e.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={css.rail} ref={railRef} data-rail>
        <div className={css.railInner} style={{ "--hours": endH - startH } as React.CSSProperties}>
          {Array.from({ length: endH - startH }, (_, i) => (
            <div className={css.hour} key={i} data-near={(isToday && Math.abs((startH + i) * 60 - nowMin) < 25) || undefined} style={{ top: `${(i / (endH - startH)) * 100}%` }}>
              <span>{hourLabel(startH + i)}</span>
            </div>
          ))}
          <div className={css.blocks}>
            {placed.map(({ e, m, lane, lanes }) => {
              const c = courseOf(e.courseId);
              const end = m + span(e);
              const range = isClass(e.kind) ? `${formatEventTime(e.time)} – ${formatEventTime(`${Math.floor(end / 60) % 24}:${String(end % 60).padStart(2, "0")}`)}` : formatEventTime(e.time);
              return (
                <button
                  type="button"
                  key={`${e.id}-${e.date}`}
                  className={css.block}
                  data-block
                  onClick={() => openEvent(e)}
                  style={{
                    top: `${Math.min((m - startH * 60) / total, 1 - span(e) / total) * 100}%`,
                    height: `${(span(e) / total) * 100}%`,
                    left: `${(lane / lanes) * 100}%`,
                    width: `${100 / lanes}%`,
                    "--c": c?.color,
                  } as React.CSSProperties}
                >
                  <small>{range}</small>
                  <strong>{e.title}</strong>
                  {e.location && <span><MapPin size={12} aria-hidden="true" /> {e.location}</span>}
                </button>
              );
            })}
          </div>
          {isToday && (
            <div
              className={css.ribbon}
              data-ribbon
              data-parked={parked}
              ref={ribbonRef}
              style={{ top: `${(rel / total) * 100}%` }}
              role="img"
              aria-label={`Now, ${nowLabel}`}
            >
              <span>Now · {nowLabel}</span>
            </div>
          )}
          {day.length === 0 && <p className={css.railEmpty}>{`Nothing scheduled ${isToday ? "today" : "this day"}`}</p>}
        </div>
      </div>
      <div className={css.footer}>
        <button type="button" className={s.secondary} onClick={onCreate}><FileText size={15} aria-hidden="true" /> Start a note</button>
        <button type="button" className={s.secondary} onClick={() => onImport("document")}><UploadCloud size={15} aria-hidden="true" /> Upload a file</button>
        <button type="button" className={s.secondary} onClick={() => onImport("scan")}><Camera size={15} aria-hidden="true" /> Scan your notes</button>
        {state.courses.length === 0 ? (
          <>
            <p className={css.quietLine}>No courses yet. Add a course to group its notes and events.</p>
            <Link className={s.primary} to="/courses"><Plus size={15} aria-hidden="true" /> Add course</Link>
          </>
        ) : (
          <button type="button" className={s.secondary} onClick={onAddCourse}><Plus size={15} aria-hidden="true" /> Add course</button>
        )}
      </div>
    </div>
  );

  const right = (
    <div className={css.notesPage}>
      <section aria-labelledby="notes-today-heading" className={css.section}>
        <h2 id="notes-today-heading">{isToday ? "Notes for today" : `Notes for ${dayName}`}</h2>
        {classes.length ? (
          <ul className={css.list}>
            {classes.map((e) => {
              const c = courseOf(e.courseId);
              const note = state.notes.find((n) => n.courseId === e.courseId && n.lectureDate === e.date);
              const key = e.id + e.date;
              return (
                <li key={key} style={{ "--c": c?.color } as React.CSSProperties}>
                  <span className={css.dot} aria-hidden="true" />
                  <span className={css.rowText}>
                    <strong>{note ? note.title : e.title}</strong>
                    <small>{c?.code ?? "Class"}{e.time ? ` · ${formatEventTime(e.time)}` : ""}</small>
                    {note && notePreview(note) && <small className={css.excerpt}>{notePreview(note)}</small>}
                  </span>
                  {note ? (
                    <Link className={s.secondary} to={`/notes/${note.id}`} aria-label={`Open note for ${c?.code ?? e.title}`}>Open</Link>
                  ) : (
                    <button type="button" className={s.secondary} disabled={starting === key} aria-label={`Start a note for ${c?.code ?? e.title}`} onClick={() => void startNote(e)}>
                      {starting === key ? "Starting…" : "Start a note"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={css.quietLine}>{`No classes ${isToday ? "today" : "this day"}. A note of your own is one click away.`}</p>
        )}
        {failure && <p role="alert" className={css.failure}>{failure}</p>}
      </section>

      <section aria-labelledby="due-heading" className={css.section}>
        <h2 id="due-heading">Due</h2>
        {due.length || later.length ? (
          <ul className={css.list}>
            {due.map((e) => {
              const n = daysAway(e.date);
              return (
                <li key={`${e.id}-${e.date}`} className={css.dueRow} style={{ "--c": courseOf(e.courseId)?.color } as React.CSSProperties}>
                  <span className={css.dot} aria-hidden="true" />
                  <button type="button" className={css.rowText} onClick={() => openEvent(e)}>
                    <strong>{e.title}</strong>
                    <small>{courseOf(e.courseId)?.code ?? "Personal"} · {e.kind}</small>
                  </button>
                  <Chip tone={n === 0 ? "due" : "later"}>{n === 0 ? "Due tonight" : n === 1 ? "Tomorrow" : `In ${n} days`}</Chip>
                </li>
              );
            })}
            {later.map((e) => (
              <li key={`${e.id}-${e.date}`} className={css.dueRow} style={{ "--c": courseOf(e.courseId)?.color } as React.CSSProperties}>
                <span className={css.dot} aria-hidden="true" />
                <button type="button" className={css.rowText} onClick={() => openEvent(e)}>
                  <strong>{e.title}</strong>
                  <small>{courseOf(e.courseId)?.code ?? "Personal"} · <time dateTime={e.date}>{new Date(`${e.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</time></small>
                </button>
                <Chip>{`In ${e.daysAway} days`}</Chip>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Nothing due this week.">Enjoy the breathing room.</Empty>
        )}
        <Link className={s.textLink} to="/assignments">See the whole semester</Link>
      </section>

      <section aria-labelledby="recent-heading" className={css.section}>
        <div className={css.sectionHead}>
          <h2 id="recent-heading">Pick up where you left off</h2>
          <Link className={s.textLink} to="/notes">All notes <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </div>
        {quick.length ? (
          <ul className={`${css.list} ${css.recent}`}>
            {quick.map((n) => (
              <li key={n.id} style={{ "--c": courseOf(n.courseId)?.color } as React.CSSProperties}>
                <span className={css.dot} aria-hidden="true" />
                <Link className={css.rowText} to={`/notes/${n.id}`}>
                  <strong>{n.title || "Untitled note"}</strong>
                  <small>{courseOf(n.courseId)?.code ?? "No course"}</small>
                  <small className={css.preview}>{notePreview(n)}</small>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No notes yet">Start a note below and it will wait for you here.</Empty>
        )}
      </section>
    </div>
  );

  const marked = [...new Set(expandedEvents.map((e) => e.date))];
  return (
    <>
      <div className={css.greeting}>
      <PageHeading
        eyebrow={now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        title={`${greeting}, ${state.user?.name.split(" ")[0] || "friend"}.`}
        description="A fresh page. A clear mind. Let’s make today a good one."
        actions={
          season && (
            <span className={css.season} data-season={season} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={SEASON_PATH[season]} />
              </svg>
            </span>
          )
        }
      />
      </div>
      {burst && (
        <div className={css.burst} data-burst aria-hidden="true">
          {PIECES.map((style, i) => <i key={i} style={style} />)}
        </div>
      )}
      <div className={css.today}>
        <WeekStrip
          date={stripDate}
          today={today}
          marked={marked}
          selected={shown}
          onPrev={() => setStripDate(shiftDay(stripDate, -7))}
          onNext={() => setStripDate(shiftDay(stripDate, 7))}
          onToday={() => { setStripDate(today); setShown(today); }}
          onSelect={setShown}
        />
        <Spread className={css.spread} label={`${dayName} ${dayDate}`} left={left} right={right} />
      </div>
      {event && <EventDialog event={event} onClose={() => setEvent(undefined)} />}
    </>
  );
}
