import { describe, expect, it } from "vitest";
import {
  checkRepeat,
  expandRepeats,
  type RepeatableCourseEvent,
} from "./recurrence";

function event(
  date: string,
  repeat?: RepeatableCourseEvent["repeat"],
): RepeatableCourseEvent {
  return {
    id: "event-1",
    courseId: "",
    title: "Work shift",
    kind: "other",
    date,
    time: "17:00",
    location: "Cafe",
    description: "Part-time job",
    source: "manual",
    repeat,
  };
}

describe("recurring schedule events", () => {
  it("expands a weekly Monday and Wednesday repeat", () => {
    const input = event("2026-11-02", {
      every: 1,
      days: [1, 3],
      until: "2026-11-22",
    });

    const result = expandRepeats(
      input,
      "2026-11-01",
      "2026-11-30",
    );

    expect(result.map((item) => item.date)).toEqual([
      "2026-11-02",
      "2026-11-04",
      "2026-11-09",
      "2026-11-11",
      "2026-11-16",
      "2026-11-18",
    ]);

    expect(result).toHaveLength(6);

    for (const item of result) {
      expect(item.repeatOf).toBe("event-1");
      expect(item.title).toBe("Work shift");
      expect(item.courseId).toBe("");
      expect(item.kind).toBe("other");
      expect(item.time).toBe("17:00");
      expect(item.location).toBe("Cafe");
      expect(item.description).toBe("Part-time job");
    }
  });

  it("skips the weeks between every 2 weeks repeats", () => {
    const input = event("2026-11-06", {
      every: 2,
      days: [5],
      until: "2026-12-11",
    });

    expect(
      expandRepeats(
        input,
        "2026-11-01",
        "2026-12-31",
      ).map((item) => item.date),
    ).toEqual([
      "2026-11-06",
      "2026-11-20",
      "2026-12-04",
    ]);
  });

  it("returns only repeats inside the visible range", () => {
    const input = event("2026-11-02", {
      every: 1,
      days: [1, 3],
      until: "2026-11-22",
    });

    expect(
      expandRepeats(
        input,
        "2026-11-08",
        "2026-11-14",
      ).map((item) => item.date),
    ).toEqual([
      "2026-11-09",
      "2026-11-11",
    ]);
  });

  it("returns nothing when the visible range ends before the event", () => {
    const input = event("2026-11-02", {
      every: 1,
      days: [1, 3],
      until: "2026-11-22",
    });

    expect(
      expandRepeats(
        input,
        "2026-10-01",
        "2026-11-01",
      ),
    ).toEqual([]);
  });

  it("does not include the start date unless its weekday is selected and includes the end date", () => {
    const input = event("2026-11-03", {
      every: 1,
      days: [1],
      until: "2026-11-16",
    });

    expect(
      expandRepeats(
        input,
        "2026-11-01",
        "2026-11-30",
      ).map((item) => item.date),
    ).toEqual([
      "2026-11-09",
      "2026-11-16",
    ]);
  });

  it("keeps calendar dates correct across daylight-saving changes", () => {
    const input = event("2026-10-26", {
      every: 1,
      days: [1],
      until: "2026-11-09",
    });

    expect(
      expandRepeats(
        input,
        "2026-10-01",
        "2026-11-30",
      ).map((item) => item.date),
    ).toEqual([
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
    ]);
  });

  it("rejects an end date before the start date", () => {
    expect(
      checkRepeat(
        {
          every: 1,
          days: [1],
          until: "2026-11-01",
        },
        "2026-11-02",
      ),
    ).toBe(
      "Choose an end date after the start date.",
    );
  });

  it("rejects repeats longer than one year but accepts exactly one year", () => {
    expect(
      checkRepeat(
        {
          every: 1,
          days: [1],
          until: "2027-11-03",
        },
        "2026-11-02",
      ),
    ).toBe(
      "Repeating events can run for at most one year.",
    );

    expect(
      checkRepeat(
        {
          every: 1,
          days: [1],
          until: "2027-11-02",
        },
        "2026-11-02",
      ),
    ).toBeNull();
  });

  it("rejects a repeat with no selected days", () => {
    expect(
      checkRepeat(
        {
          every: 1,
          days: [],
          until: "2026-11-09",
        },
        "2026-11-02",
      ),
    ).toBe("Choose at least one day.");
  });
});