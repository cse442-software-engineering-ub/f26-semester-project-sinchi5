import { describe, expect, it } from "vitest";
import type { CourseEvent, EventKind } from "../domain";
import { semesterList } from "./semester";

function event(
  title: string,
  date: string,
  options: {
    courseId?: string;
    kind?: EventKind;
    time?: string;
  } = {},
): CourseEvent {
  return {
    id: title,
    courseId: options.courseId ?? "cse442",
    title,
    kind: options.kind ?? "assignment",
    date,
    time: options.time ?? "",
    location: "",
    description: "",
    source: "manual",
  };
}

describe("semesterList", () => {
  it("drops lectures", () => {
    const result = semesterList(
      [
        event("Lecture 12", "2026-10-28", {
          kind: "lecture",
        }),
        event("Midterm exam", "2026-10-28", {
          kind: "exam",
        }),
      ],
      "2026-10-26",
    );

    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0].events.map((item) => item.title)).toEqual([
      "Midterm exam",
    ]);
  });

  it("groups upcoming items by Sunday and splits off past items", () => {
    const result = semesterList(
      [
        event("Sunday past", "2026-10-25"),
        event("Saturday", "2026-10-31"),
        event("Next Sunday", "2026-11-01"),
      ],
      "2026-10-26",
    );

    expect(result.past.map((item) => item.title)).toEqual(["Sunday past"]);

    expect(result.upcoming).toHaveLength(2);

    expect(result.upcoming[0].weekStart).toBe("2026-10-25");
    expect(result.upcoming[0].label).toBe("Week of October 25");
    expect(result.upcoming[0].events.map((item) => item.title)).toEqual([
      "Saturday",
    ]);

    expect(result.upcoming[1].weekStart).toBe("2026-11-01");
    expect(result.upcoming[1].label).toBe("Week of November 1");
    expect(result.upcoming[1].events.map((item) => item.title)).toEqual([
      "Next Sunday",
    ]);
  });

  it("returns empty collections when there are no events", () => {
    expect(semesterList([], "2026-10-26")).toEqual({
      upcoming: [],
      past: [],
    });
  });

  it("puts one future event in one week", () => {
    const result = semesterList(
      [event("Homework 5", "2026-10-27")],
      "2026-10-26",
    );

    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0].events).toHaveLength(1);
    expect(result.upcoming[0].events[0].title).toBe("Homework 5");
  });

  it("sorts all-day items before timed items on the same day", () => {
    const result = semesterList(
      [
        event("Homework 5", "2026-10-27", {
          time: "23:59",
        }),
        event("Gym", "2026-10-27", {
          courseId: "",
          kind: "other",
          time: "18:00",
        }),
        event("Reading 2", "2026-10-27"),
      ],
      "2026-10-26",
    );

    expect(result.upcoming[0].events.map((item) => item.title)).toEqual([
      "Reading 2",
      "Gym",
      "Homework 5",
    ]);
  });

  it("groups many events across many weeks in date order", () => {
    const events: CourseEvent[] = [];

    for (let week = 0; week < 15; week++) {
      const first = new Date(2026, 0, 4 + week * 7);
      const second = new Date(2026, 0, 5 + week * 7);

      const format = (date: Date) =>
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
          2,
          "0",
        )}-${String(date.getDate()).padStart(2, "0")}`;

      events.push(
        event(`A${week}`, format(first)),
        event(`B${week}`, format(second)),
      );
    }

    const result = semesterList(events, "2026-01-01");

    expect(result.upcoming).toHaveLength(15);
    expect(result.upcoming.flatMap((group) => group.events)).toHaveLength(30);

    const weekStarts = result.upcoming.map((group) => group.weekStart);

    expect(weekStarts).toEqual([...weekStarts].sort());
  });

  it("filters all courses, one course, and Personal correctly", () => {
    const events = [
      event("CSE 442 Event", "2026-10-28", {
        courseId: "cse442",
      }),
      event("CSE 250 Event", "2026-10-29", {
        courseId: "cse250",
      }),
      event("Personal Event", "2026-10-30", {
        courseId: "",
        kind: "other",
      }),
    ];

    const cse442 = semesterList(events, "2026-10-26", "cse442");
    expect(
      cse442.upcoming.flatMap((group) =>
        group.events.map((item) => item.title),
      ),
    ).toEqual(["CSE 442 Event"]);

    const personal = semesterList(events, "2026-10-26", "");
    expect(
      personal.upcoming.flatMap((group) =>
        group.events.map((item) => item.title),
      ),
    ).toEqual(["Personal Event"]);

    const all = semesterList(events, "2026-10-26");
    expect(
      all.upcoming.flatMap((group) =>
        group.events.map((item) => item.title),
      ),
    ).toEqual(["CSE 442 Event", "CSE 250 Event", "Personal Event"]);
  });

  it("keeps week labels correct across the end of the year", () => {
    const result = semesterList(
      [
        event("January 2 Event", "2027-01-02"),
        event("January 3 Event", "2027-01-03"),
      ],
      "2026-12-28",
    );

    expect(result.upcoming).toHaveLength(2);

    expect(result.upcoming[0].weekStart).toBe("2026-12-27");
    expect(result.upcoming[0].label).toBe("Week of December 27");
    expect(result.upcoming[0].events[0].title).toBe("January 2 Event");

    expect(result.upcoming[1].weekStart).toBe("2027-01-03");
    expect(result.upcoming[1].label).toBe("Week of January 3");
    expect(result.upcoming[1].events[0].title).toBe("January 3 Event");
  });
});