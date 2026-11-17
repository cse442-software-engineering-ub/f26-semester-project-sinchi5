import { useState } from "react";
import type { CourseEvent } from "../domain";
import { useApp } from "../app/context";
import { dateKey } from "../services/fixtures";
import { semesterList } from "../services/semester";
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

export function Assignments() {
  const { state } = useApp();

  const [courseFilter, setCourseFilter] = useState("__all__");
  const [showPast, setShowPast] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CourseEvent>();

  const today = dateKey();

  const selectedCourseId =
    courseFilter === "__all__" ? undefined : courseFilter;

  const { upcoming, past } = semesterList(
    state.events,
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

  function eventRow(event: CourseEvent) {
    return (
      <button
        key={event.id}
        type="button"
        className={css.row}
        onClick={() => setSelectedEvent(event)}
      >
        <span className={css.when}>
          <strong>{displayDate(event.date)}</strong>
          <span>{displayTime(event.time)}</span>
        </span>

        <span className={css.info}>
          <strong>{event.title}</strong>
          <span>
            {courseLabel(event)} · {event.kind}
          </span>
        </span>
      </button>
    );
  }

  return (
    <>
      <div className={css.page}>
        <div className={css.heading}>
          <div>
            <h1>Assignments</h1>
            <p className={s.muted}>
              Everything due this semester, in order.
            </p>
          </div>

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
        </div>

        {upcoming.length === 0 ? (
          <div className={s.empty}>
            <h3>Nothing due yet</h3>
            <p>Add events in your schedule or upload a syllabus.</p>
          </div>
        ) : (
          <div className={css.weeks}>
            {upcoming.map((week) => (
              <section key={week.weekStart} className={css.week}>
                <h2>{week.label}</h2>

                <div className={css.rows}>
                  {week.events.map(eventRow)}
                </div>
              </section>
            ))}
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
              <section className={css.week}>
                <h2>Earlier this semester</h2>

                <div className={css.rows}>
                  {past.map(eventRow)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {selectedEvent && (
        <EventDialog
          event={selectedEvent}
          onClose={() => setSelectedEvent(undefined)}
        />
      )}
    </>
  );
}