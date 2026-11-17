import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  FileText,
  Camera,
  UploadCloud,
  Sparkles,
} from "lucide-react";
import { useApp } from "../app/context";
import {
  PageHeading,
  NoteCard,
  EventRow,
  Empty,
  formatEventTime,
  countOf,
} from "../shared/ui";
import { dateKey } from "../services/fixtures";
import { comingUp, weekAhead } from "../services/upcoming";
import { expandRepeats } from "../services/recurrence";
import { EventDialog } from "./schedule";
import {
  type CourseEvent,
  type UploadKind,
} from "../domain";
import css from "./dashboard.module.css";
import s from "../shared/ui.module.css";
// Shared classes this screen's own rules also name (see dashboard.module.css), applied together.
const both = { dashboardAside: `${s.dashboardAside} ${css.dashboardAside}` };

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

export function Dashboard({
  onImport,
  onCreate,
  onAddCourse,
}: {
  onImport: (kind: UploadKind) => void;
  onCreate: () => void;
  onAddCourse: () => void;
}) {
  const { state } = useApp();

  const [event, setEvent] =
    useState<CourseEvent>();

  const today = dateKey();

  const horizonDate = new Date(
    `${today}T12:00:00`,
  );

  horizonDate.setFullYear(
    horizonDate.getFullYear() + 1,
  );

  const horizon = dateKey(horizonDate);

  const expandedEvents =
    state.events.flatMap((item) =>
      expandRepeats(
        item,
        today,
        horizon,
      ),
    );

  function openEvent(
    occurrence: CourseEvent,
  ) {
    const originalId =
      occurrence.repeatOf ??
      occurrence.id;

    const original =
      state.events.find(
        (item) =>
          item.id === originalId,
      );

    setEvent(
      original ?? occurrence,
    );
  }

  // Task #135 / Story #133:
  // use Task #134's ordered groups on every schedule update.
  const week = weekAhead(
    expandedEvents,
    today,
  );

  // A day can contain several due items;
  // the summary counts events, not groups.
  const weekCount = week.reduce(
    (total, group) =>
      total + group.events.length,
    0,
  );

  const day =
    expandedEvents.filter(
      (item) =>
        item.date === today,
    );

  // Task #136 / Story #133:
  // Task #134 selects the next three exams/projects,
  // excluding the current seven-day window reserved
  // for the week card.
  const upcoming = comingUp(
    expandedEvents,
    today,
  );

  const [burst, setBurst] = useState(false);
  // Today has no "mark done" control, so the burst marks the first time a day has nothing left due.
  useEffect(() => {
    if (day.length || !state.courses.length || celebratedDays.has(today) || calm()) return;
    celebratedDays.add(today);
    setBurst(true);
    const t = setTimeout(() => setBurst(false), 900);
    return () => clearTimeout(t);
  }, [day.length, state.courses.length, today]);
  const season = seasonGlyph(new Date());

  const hour =
    new Date().getHours();

  const greeting =
    hour < 12
      ? "Good morning"
      : hour < 17
        ? "Good afternoon"
        : "Good evening";

  const quick = [...state.notes]
    .sort(
      (a, b) =>
        Number(b.pinned) -
          Number(a.pinned) ||
        b.updatedAt.localeCompare(
          a.updatedAt,
        ),
    )
    .slice(0, 3);

  return (
    <>
      <PageHeading
        eyebrow={new Date().toLocaleDateString(
          undefined,
          {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          },
        )}
        title={`${greeting}, ${
          state.user?.name.split(" ")[0] ||
          "friend"
        }.`}
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
      {burst && (
        <div className={css.burst} data-burst aria-hidden="true">
          {PIECES.map((style, i) => <i key={i} style={style} />)}
        </div>
      )}

      <div className={css.today}>
      <div className={css.grid}>
      <section
        className={css.weekCard}
        aria-labelledby="week-heading"
      >
        <h2 id="week-heading">
          Your week at a glance
        </h2>

        {weekCount ? (
          <>
            <p className={css.weekSummary}>
              {weekCount}{" "}
              {weekCount === 1
                ? "thing"
                : "things"}{" "}
              due this week
            </p>

            {week.map((group) => (
              <section
                className={css.weekDay}
                key={group.date}
                aria-label={
                  group.label
                }
              >
                <h3>{group.label}</h3>

                {group.events.map(
                  (item) => (
                    <button
                      key={`${item.id}-${item.date}`}
                      type="button"
                      className={
                        css.weekRow
                      }
                      onClick={() =>
                        openEvent(
                          item,
                        )
                      }
                    >
                      <span
                        className={
                          css.weekTime
                        }
                      >
                        {item.time
                          ? formatEventTime(
                              item.time,
                            )
                          : "All day"}
                      </span>

                      <span
                        className={
                          css.weekInfo
                        }
                      >
                        <strong>
                          {item.title}
                        </strong>

                        <span>
                          {state.courses.find(
                            (
                              course,
                            ) =>
                              course.id ===
                              item.courseId,
                          )?.code ||
                            "Personal"}{" "}
                          · {item.kind}
                        </span>
                      </span>

                      <ArrowUpRight
                        size={16}
                        aria-hidden="true"
                      />
                    </button>
                  ),
                )}
              </section>
            ))}
          </>
        ) : (
          <Empty title="Nothing due this week.">
            Enjoy the breathing room.
          </Empty>
        )}

        <Link
          className={s.textLink}
          to="/assignments"
        >
          See the whole semester{" "}
          <ArrowRight
            size={17}
            aria-hidden="true"
          />
        </Link>
      </section>

        <div className={css.main}>
          <section
            className={css.block}
          >
            <div
              className={
                css.head
              }
            >
              <div>
                <h2>
                  Pick up where you
                  left off
                </h2>
                <p>
                  Your ideas, right
                  within reach.
                </p>
              </div>

              <Link
                className={
                  s.textLink
                }
                to="/notes"
              >
                All notes{" "}
                <ArrowUpRight
                  size={16}
                />
              </Link>
            </div>

            {quick.length ? (
              <div
                className={
                  css.noteGrid
                }
              >
                {quick.map((n) => (
                  <NoteCard
                    key={n.id}
                    note={n}
                  />
                ))}
              </div>
            ) : (
              <Empty title="No notes yet">
                Start a note below and
                it will wait for you
                here.
              </Empty>
            )}
          </section>

          <section
            className={css.block}
          >
            <div
              className={
                css.head
              }
            >
              <div>
                <h2>
                  Make it your own
                </h2>
                <p>
                  A few ways to bring
                  your thoughts
                  together.
                </p>
              </div>
            </div>

            <div
              className={
                css.quickActions
              }
            >
              <button
                onClick={onCreate}
              >
                <span>
                  <FileText
                    size={21}
                  />
                </span>
                <strong>
                  Start a note
                </strong>
                <small>
                  A blank page.
                  Anything is
                  possible.
                </small>
                <ArrowUpRight
                  size={16}
                />
              </button>

              <button
                onClick={() =>
                  onImport(
                    "document",
                  )
                }
              >
                <span>
                  <UploadCloud
                    size={21}
                  />
                </span>
                <strong>
                  Upload a file
                </strong>
                <small>
                  Your notes, now all
                  in one place.
                </small>
                <ArrowUpRight
                  size={16}
                />
              </button>

              <button
                onClick={() =>
                  onImport("scan")
                }
              >
                <span>
                  <Camera
                    size={21}
                  />
                </span>
                <strong>
                  Scan your notes
                </strong>
                <small>
                  From paper to your
                  pocket.
                </small>
                <ArrowUpRight
                  size={16}
                />
              </button>
            </div>
          </section>

          <section
            className={css.block}
          >
            <div
              className={
                css.head
              }
            >
              <h2>Your courses</h2>

              <button
                type="button"
                className={
                  s.secondary
                }
                onClick={
                  onAddCourse
                }
              >
                <Plus size={15} />{" "}
                Add course
              </button>
            </div>

            {state.courses.length === 0 ? (
              <div className={css.noCourses}>
                <Empty title="No courses yet">
                  Add a course to group its notes and events.
                </Empty>
                <Link
                  className={s.primary}
                  to="/courses"
                >
                  <Plus size={15} />{" "}
                  Add course
                </Link>
              </div>
            ) : (
            <div
              className={
                css.courseTiles
              }
            >
              {state.courses.map(
                (c) => (
                  <Link
                    to={`/courses/${c.id}`}
                    key={c.id}
                  >
                    <span
                      className={
                        css.courseDot
                      }
                      style={{
                        background:
                          c.color,
                      }}
                    />

                    <div>
                      <strong>
                        {c.code}
                      </strong>
                      <small>
                        {c.name}
                      </small>
                    </div>

                    <ArrowUpRight
                      size={15}
                    />
                  </Link>
                ),
              )}
            </div>
            )}
          </section>
        </div>

        <aside
          className={
            both.dashboardAside
          }
        >
          <section
            className={`${s.panel} ${css.card}`}
          >
            <div
              className={
                css.head
              }
            >
              <h2>
                On the horizon
              </h2>

              <Link
                className={
                  s.iconButton
                }
                aria-label="Open schedule"
                to="/schedule"
              >
                <ArrowUpRight
                  size={18}
                />
              </Link>
            </div>

            <div
              className={css.miniWeek}
            >
              {Array.from(
                { length: 7 },
                (_, i) => {
                  const d =
                    new Date();

                  d.setDate(
                    d.getDate() -
                      d.getDay() +
                      i,
                  );

                  return (
                    <Link
                      key={i}
                      to={`/schedule?date=${dateKey(
                        d,
                      )}`}
                      className={
                        dateKey(d) ===
                        today
                          ? css.weekToday
                          : ""
                      }
                    >
                      <span>
                        {d.toLocaleDateString(
                          undefined,
                          {
                            weekday:
                              "narrow",
                          },
                        )}
                      </span>

                      <strong>
                        {d.getDate()}
                      </strong>

                      <i />
                    </Link>
                  );
                },
              )}
            </div>

            <div
              className={
                css.smallHeading
              }
            >
              <span>TODAY</span>
              <span>
                {countOf(day.length, "event")}
              </span>
            </div>

            {day.length ? (
              day.map((item) => (
                <EventRow
                  key={`${item.id}-${item.date}`}
                  event={item}
                  onClick={openEvent}
                />
              ))
            ) : (
              <Empty title="Nothing on the calendar">
                A little room to
                breathe.
              </Empty>
            )}

            <Link
              className={
                s.textLink
              }
              to="/schedule"
            >
              See your full schedule{" "}
              <ArrowRight
                size={15}
              />
            </Link>
          </section>

          <section
            className={`${s.panel} ${css.card}`}
            aria-labelledby="coming-up-heading"
          >
            <div
              className={
                css.head
              }
            >
              <h2 id="coming-up-heading">
                Coming up
              </h2>

              <span
                className={css.count}
              >
                {upcoming.length}
              </span>
            </div>

            {upcoming.map(
              (item) => (
                <button
                  type="button"
                  className={
                    css.comingUpRow
                  }
                  key={`${item.id}-${item.date}`}
                  onClick={() =>
                    openEvent(
                      item,
                    )
                  }
                >
                  <span
                    className={
                      css.comingUpIcon
                    }
                    aria-hidden="true"
                  >
                    <FileText
                      size={17}
                    />
                  </span>

                  <span
                    className={
                      css.comingUpInfo
                    }
                  >
                    <strong>
                      {item.title}
                    </strong>

                    <small>
                      {state.courses.find(
                        (c) =>
                          c.id ===
                          item.courseId,
                      )?.code ||
                        "Personal"}
                    </small>

                    <time
                      dateTime={
                        item.date
                      }
                    >
                      {new Date(
                        item.date +
                          "T12:00:00",
                      ).toLocaleDateString(
                        "en-US",
                        {
                          weekday:
                            "short",
                          month:
                            "short",
                          day: "numeric",
                        },
                      )}
                    </time>

                    <em>
                      in{" "}
                      {item.daysAway}{" "}
                      days
                    </em>
                  </span>
                </button>
              ),
            )}

            {upcoming.length ===
              0 && (
              <p
                className={
                  css.comingUpEmpty
                }
              >
                No exams or projects
                coming up.
              </p>
            )}
          </section>

          <div
            className={css.quietNote}
          >
            <Sparkles size={20} />

            <p>
              You don’t have to have
              it all figured out.
              <br />
              <strong>
                Just start with one
                note.
              </strong>
            </p>
          </div>
        </aside>
      </div>
      </div>

      {event && (
        <EventDialog
          event={event}
          onClose={() =>
            setEvent(undefined)
          }
        />
      )}
    </>
  );
}