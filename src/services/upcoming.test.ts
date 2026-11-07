import { describe, expect, it } from "vitest";
import type { CourseEvent, EventKind } from "../domain";
import { comingUp, weekAhead } from "./upcoming";

const today = "2026-10-26";
function event(id: string, date: string, kind: EventKind = "assignment", time = ""): CourseEvent {
  return {
    id, title: id, courseId: "cse442", date, kind, time,
    location: "Davis Hall", description: "Bring notes", source: "imported", seriesId: null,
  };
}

describe("Task #134 processing for Story #133", () => {
  it("A: includes today through day six, with exact labels", () => {
    const first = event("today", today);
    const last = event("last", "2026-11-01");
    expect(weekAhead([event("next week", "2026-11-02"), last, event("yesterday", "2026-10-25"), first], today))
      .toEqual([{ date: today, label: "Today", events: [first] },
        { date: "2026-11-01", label: "Sunday, November 1", events: [last] }]);
  });

  it("B: excludes lecture, lab and recitation while retaining every due kind", () => {
    const kinds: EventKind[] = ["lecture", "lab", "recitation", "quiz", "assignment", "exam", "deadline", "other"];
    expect(weekAhead(kinds.map((kind) => event(kind, today, kind)), today)[0].events.map((e) => e.kind))
      .toEqual(["quiz", "assignment", "exam", "deadline", "other"]);
  });

  it("C: returns empty collections when no events qualify", () => {
    expect(weekAhead([], today)).toEqual([]);
    expect(weekAhead([event("past", "2026-10-25"), event("class", today, "lecture")], today)).toEqual([]);
    expect(comingUp([], today)).toEqual([]);
    expect(comingUp([event("past exam", "2026-10-25", "exam"), event("soon", today, "deadline"),
      event("assignment", "2026-11-10")], today)).toEqual([]);
  });

  it("C: groups a single assignment tomorrow", () => {
    const assignment = event("Homework", "2026-10-27");
    expect(weekAhead([assignment], today)).toEqual([{ date: assignment.date, label: "Tomorrow", events: [assignment] }]);
  });

  it("C: puts Reading 2 before Quiz 3 and sorts times with stable ties", () => {
    const input = [event("late", today, "exam", "15:00"), event("Quiz 3", today, "quiz", "09:00"),
      event("Reading 2", today), event("same time", today, "other", "09:00"), event("all-day tie", today)];
    expect(weekAhead(input, today)[0].events.map((e) => e.title))
      .toEqual(["Reading 2", "all-day tie", "Quiz 3", "same time", "late"]);
  });

  it("C: orders nine events into seven calendar-date groups", () => {
    const dates = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];
    const input = dates.map((date, i) => event(String(i), date));
    input.push(event("extra one", dates[0]), event("extra two", dates[6]));
    const groups = weekAhead(input.reverse(), today);
    expect(groups.map((g) => g.date)).toEqual(dates);
    expect(groups.map((g) => g.events.length)).toEqual([2, 1, 1, 1, 1, 1, 2]);
  });

  it("D: labels the correct day across the year boundary", () => {
    const exam = event("Exam", "2027-01-04", "exam");
    expect(weekAhead([exam], "2026-12-29"))
      .toEqual([{ date: exam.date, label: "Monday, January 4", events: [exam] }]);
  });

  it("E: selects the next three exams and deadlines with exact daysAway", () => {
    const exam = event("Exam 1", "2026-11-05", "exam");
    const deadline = event("Project", "2026-11-15", "deadline");
    const next = event("Exam 2", "2026-11-25", "exam");
    const input = [event("Exam 3", "2026-12-05", "exam"), next, event("Assignment", "2026-11-10"),
      deadline, event("inside week", "2026-10-30", "exam"), exam];
    expect(comingUp(input, today)).toEqual([{ ...exam, daysAway: 10 }, { ...deadline, daysAway: 20 }, { ...next, daysAway: 30 }]);
    expect(comingUp([event("DST exam", "2026-11-09", "exam")], "2026-10-30")[0].daysAway).toBe(10);
  });

  it("E: starts at day seven, sorts all-day and timed ties, and honors limits", () => {
    const input = [event("late", "2026-11-02", "exam", "14:00"), event("early", "2026-11-02", "deadline", "09:00"),
      event("all day", "2026-11-02", "exam"), event("tie", "2026-11-02", "exam", "09:00"),
      event("day six", "2026-11-01", "exam"),
      ...(["assignment", "quiz", "lecture", "lab", "recitation", "other"] as EventKind[])
        .map((kind) => event(kind, "2026-11-02", kind))];
    expect(comingUp(input, today, 10).map((e) => [e.id, e.daysAway]))
      .toEqual([["all day", 7], ["early", 7], ["tie", 7], ["late", 7]]);
    expect(comingUp(input, today, 1).map((e) => e.id)).toEqual(["all day"]);
    expect(comingUp(input, today, 0)).toEqual([]);
  });

  it("preserves every field without mutating either input array or its events", () => {
    const soon = Object.freeze(event("soon", "2026-10-27", "quiz", "09:00"));
    const later = Object.freeze(event("later", "2026-11-09", "deadline"));
    const input = Object.freeze([later, soon]);
    const snapshot = input.map((e) => ({ ...e }));
    expect(weekAhead(input, today)[0].events).toEqual([soon]);
    expect(comingUp(input, today)).toEqual([{ ...later, daysAway: 14 }]);
    expect(input).toEqual(snapshot);
  });
});
