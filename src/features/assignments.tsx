import { useState, type CSSProperties } from "react";
import type { CourseEvent } from "../domain";
import { useApp } from "../app/context";
import { dateKey } from "../services/fixtures";
import { semesterList } from "../services/semester";
import { expandRepeats } from "../services/recurrence";
import { Chip, PageHeading, Sheet } from "../shared/ui";
import { EventDialog } from "./schedule";
import css from "./assignments.module.css";
import s from "../shared/ui.module.css";

function displayDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function displayTime(time: string) {
  if (!time) return "All day";

  const [hourText, minute] = time.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${suffix}`;
}

// A Sunday-to-Saturday week (keyed by its Sunday) holds `today` when today is 0 to 6 days after it.
function holdsToday(weekStart: string, today: string) {
  const days = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${weekStart}T12:00:00Z`)) / 86400000;
  return days >= 0 && days < 7;
}

export function Assignments() {
  const { state } = useApp();

  const [courseFilter, setCourseFilter] = useState("__all__");
  const [showPast, setShowPast] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CourseEvent>();

  const today = dateKey();

  const selectedCourseId =
    courseFilter === "__all__" ? undefined : courseFilter;

  // A repeating event is one record; list each of its dates, as Schedule and Today do (card 149).
  const occurrences = state.events.flatMap((e) => expandRepeats(e, e.date, e.repeat?.until ?? e.date));
  const { upcoming, past } = semesterList(
    occurrences,
    today,
    selectedCourseId,
  );

  function courseLabel(event: CourseEvent) {
    if (!event.courseId) return "Personal";

    return (
      state.courses.find((course) => course.id === event.courseId)?.code ??
      "Course"
    );
  }

  function eventRow(event: CourseEvent, isPast = false) {
    const course = state.courses.find((c) => c.id === event.courseId);

    return (
      <button
        key={`${event.id}-${event.date}`}
        type="button"
        className={css.row}
        data-past={isPast || undefined}
        style={{ "--edge": course?.color ?? "var(--hover-line)" } as CSSProperties}
        onClick={() => setSelectedEvent(event)}
      >
        <span className={css.when}>
          <strong>{displayDate(event.date)}</strong>
          <span>{displayTime(event.time)}</span>
        </span>

        <span className={css.info}>
          <strong>{event.title}</strong>
          <span className={css.meta}>
            {courseLabel(event)} · {event.kind}
            {isPast ? <Chip>Past</Chip> : event.date === today ? <Chip tone="due">Today</Chip> : null}
          </span>
        </span>
      </button>
    );
  }

  return (
    <>
      <div className={css.page}>
        <PageHeading
          title="Assignments"
          description="Everything due this semester, in order."
          actions={
            <label className={css.filter}>
              Course
              <select
                value={courseFilter}
                onChange={(event) => setCourseFilter(event.target.value)}
              >
                <option value="__all__">All</option>
                <option value="">Personal</option>

                {state.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code}
                  </option>
                ))}
              </select>
            </label>
          }
        />

        {upcoming.length === 0 ? (
          <div className={s.empty}>
            <h3>Nothing due yet</h3>
            <p>Add events in your schedule or upload a syllabus.</p>
          </div>
        ) : (
          <div className={css.weeks}>
            {upcoming.map((week) => {
              const current = holdsToday(week.weekStart, today);

              return (
                <Sheet key={week.weekStart} className={css.week}>
                  <header className={css.weekHead}>
                    <h2>{week.label}</h2>
                    {current && <span className={css.ribbon}>This week</span>}
                  </header>

                  <div className={css.rows}>{week.events.map((e) => eventRow(e))}</div>
                </Sheet>
              );
            })}
          </div>
        )}

        {past.length > 0 && (
          <div className={css.past}>
            <button
              type="button"
              className={css.toggle}
              onClick={() => setShowPast((current) => !current)}
            >
              {showPast ? "Hide past items" : "Show past items"}
            </button>

            {showPast && (
              <Sheet className={css.week}>
                <header className={css.weekHead}>
                  <h2>Earlier this semester</h2>
                </header>

                <div className={css.rows}>{past.map((e) => eventRow(e, true))}</div>
              </Sheet>
            )}
          </div>
        )}
      </div>

      {selectedEvent && (
        <EventDialog
          event={state.events.find((e) => e.id === (selectedEvent.repeatOf ?? selectedEvent.id)) ?? selectedEvent}
          occurrence={selectedEvent.date}
          onClose={() => setSelectedEvent(undefined)}
        />
      )}
    </>
  );
}
