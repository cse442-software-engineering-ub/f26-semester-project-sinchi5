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
      />

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

      <div
        className={
          css.dashboardGrid
        }
      >
        <div>
          <section
            className={s.section}
          >
            <div
              className={
                s.sectionHeading
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

            <div
              className={
                s.quickNotes
              }
            >
              {quick.map((n) => (
                <NoteCard
                  key={n.id}
                  note={n}
                />
              ))}
            </div>
          </section>

          <section
            className={s.section}
          >
            <div
              className={
                s.sectionHeading
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
            className={s.section}
          >
            <div
              className={
                s.sectionHeading
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
          </section>
        </div>

        <aside
          className={
            both.dashboardAside
          }
        >
          <section
            className={s.panel}
          >
            <div
              className={
                s.sectionHeading
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
            className={s.panel}
            aria-labelledby="coming-up-heading"
          >
            <div
              className={
                s.sectionHeading
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