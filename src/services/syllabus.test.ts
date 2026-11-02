import { describe, expect, it } from "vitest";
import { checkMeeting, MAX_SYLLABUS_EVENTS, meetingDates, normalizeBreaks, normalizeEvents, normalizeMeetings } from "./syllabus";

const MWF = { days: [1, 3, 5], starts: "2026-08-24", ends: "2026-09-04" };

describe("turning a weekly class into its dates (card 44)", () => {
  it("Task test 1 - a class lands on the wrong days", () => {
    expect(meetingDates(MWF)).toEqual(["2026-08-24", "2026-08-26", "2026-08-28", "2026-08-31", "2026-09-02", "2026-09-04"]);
    // SOC 322's pattern: Tuesdays and Thursdays only.
    expect(meetingDates({ days: [2, 4], starts: "2026-08-25", ends: "2026-09-03" })).toEqual(["2026-08-25", "2026-08-27", "2026-09-01", "2026-09-03"]);
  });

  it("Task test 2 - a class shows up on a day with no class", () => {
    const noClass = [{ from: "2026-08-26", to: "2026-08-26" }, { from: "2026-08-31", to: "2026-09-02" }];
    expect(meetingDates(MWF, noClass)).toEqual(["2026-08-24", "2026-08-28", "2026-09-04"]);
    expect(meetingDates(MWF, [{ from: "2026-08-01", to: "2026-12-31" }])).toEqual([]);
  });

  it("Task test 3 - the first or last class is dropped, or a date outside the range is added", () => {
    // Starts midweek and ends on a class day; the days before the start don't count.
    expect(meetingDates({ days: [1, 3], starts: "2026-08-26", ends: "2026-09-07" })).toEqual(["2026-08-26", "2026-08-31", "2026-09-02", "2026-09-07"]);
    // Neither end is a class day.
    expect(meetingDates({ days: [3], starts: "2026-08-24", ends: "2026-08-25" })).toEqual([]);
  });

  it("Task test 4 - a clock change moves a class to another day", () => {
    // The clocks go back on November 1, 2026.
    expect(meetingDates({ days: [1], starts: "2026-10-26", ends: "2026-11-09" })).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
  });

  it("Task test 5 - a class with impossible dates or no days can be added", () => {
    expect(checkMeeting(MWF)).toBeNull();
    expect(checkMeeting({ ...MWF, days: [] })).toBe("Choose at least one day.");
    expect(checkMeeting({ ...MWF, starts: "" })).toBe("Choose when each class starts and ends.");
    expect(checkMeeting({ ...MWF, ends: "" })).toBe("Choose when each class starts and ends.");
    expect(checkMeeting({ ...MWF, ends: "2026-08-24" })).toBe("Choose an end date after the start date.");
    expect(checkMeeting({ ...MWF, ends: "2026-08-01" })).toBe("Choose an end date after the start date.");
    expect(checkMeeting({ ...MWF, ends: "2027-08-25" })).toBeNull();
    expect(checkMeeting({ ...MWF, ends: "2027-08-26" })).toBe("Repeating events can run for at most one year.");
  });
});

describe("cleaning what the reader found (card 44)", () => {
  it("Task test 6 - a bad weekly class from the reader reaches the review screen", () => {
    expect(normalizeMeetings([
      { title: " Lecture ", kind: "lecture", section: "", days: [5, 1, 3, 3], time: "13:00", location: "Knox 109", firstDate: "2026-08-24", lastDate: "2026-12-07", source: "MoWeFr" },
      { title: "", kind: "party", section: "R1", days: [2, 9, "x", 1.5], time: "25:00", location: 7, firstDate: "2026-02-30", lastDate: "soon", source: null },
      { title: "Lab", kind: "lab", days: [], time: "10:00" },
      "not a class",
    ])).toEqual([
      { title: "Lecture", kind: "lecture", section: "", days: [1, 3, 5], time: "13:00", location: "Knox 109", firstDate: "2026-08-24", lastDate: "2026-12-07", source: "MoWeFr" },
      { title: "Lecture", kind: "lecture", section: "R1", days: [2], time: "", location: "", firstDate: "", lastDate: "", source: "" },
    ]);
    expect(normalizeMeetings(undefined)).toEqual([]);
    expect(normalizeMeetings(Array(70).fill({ title: "Lab", kind: "lab", days: [1] }))).toHaveLength(60);
  });

  it("Task test 7 - a bad date is treated as real, or an item without a date looks finished", () => {
    expect(normalizeEvents([
      { title: "Midterm exam", kind: "exam", date: "2026-10-14", time: "10:00", location: "Knox 110", source: "Midterm exam October 14" },
      { title: "Final exam", kind: "exam", date: "", time: "", location: "", source: "Final exam: TBA" },
      { title: "Quiz 1", kind: "quiz", date: "2026-02-30", time: "7pm", source: "" },
      { title: "Poster", kind: "admin", date: "2026-11-02" },
    ])).toEqual([
      { title: "Midterm exam", kind: "exam", date: "2026-10-14", time: "10:00", location: "Knox 110", source: "Midterm exam October 14" },
      { title: "Final exam", kind: "exam", date: "", source: "Final exam: TBA", needsReview: true },
      { title: "Quiz 1", kind: "quiz", date: "", source: "", needsReview: true },
      { title: "Poster", kind: "other", date: "2026-11-02", source: "" },
    ]);
  });

  it("Task test 8 - text is lost, duplicates pile up, or the list has no limit", () => {
    expect(normalizeEvents([{ title: "Exposé – final draft", kind: "deadline", date: "2026-12-01" }])[0].title).toBe("Exposé – final draft");
    expect(normalizeEvents([{ title: "Quiz​ 1‮", date: "2026-11-02" }])[0].title).toBe("Quiz 1");
    const same = { title: "Homework 1", kind: "assignment", date: "2026-09-28", time: "" };
    expect(normalizeEvents([same, { ...same, title: "homework 1" }])).toHaveLength(1);
    // Same day, different items: both stay.
    expect(normalizeEvents([same, { ...same, title: "Quiz 1", kind: "quiz" }])).toHaveLength(2);
    const many = Array.from({ length: MAX_SYLLABUS_EVENTS + 5 }, (_, i) => ({ title: `Item ${i}`, date: "2026-09-28" }));
    expect(normalizeEvents(many)).toHaveLength(MAX_SYLLABUS_EVENTS);
    expect(normalizeEvents("not a list")).toEqual([]);
  });

  it("Task test 9 - a no-class range is lost or runs backward", () => {
    expect(normalizeBreaks([
      { from: "2026-09-07", to: "2026-09-07" }, { from: "2026-11-23", to: "2026-11-27" },
      { from: "2026-10-12", to: "2026-10-01" }, { from: "2026-12-24" }, { from: "nope", to: "2026-12-25" }, "not a break",
    ])).toEqual([
      { from: "2026-09-07", to: "2026-09-07" }, { from: "2026-11-23", to: "2026-11-27" },
      { from: "2026-10-12", to: "2026-10-12" }, { from: "2026-12-24", to: "2026-12-24" },
    ]);
    expect(normalizeBreaks(undefined)).toEqual([]);
  });
});
