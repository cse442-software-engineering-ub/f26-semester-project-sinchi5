import { describe, expect, it } from "vitest";
import { checkDates, extractEvents, MAX_SYLLABUS_EVENTS, mergeEvents, normalizeEvents, rulesVerdict, type ProposedEvent } from "./syllabus";

// The source line is checked separately so each expectation stays readable.
const withoutSource = (events: ProposedEvent[]) => events.map(({ source: _source, ...event }) => event);

describe("syllabus event extraction (card 44)", () => {
  it("Task test 1: finds clear events with their kind, ISO date, and time", () => {
    const lines = [
      "Homework 1 due September 28, 2026",
      "Midterm exam October 14, 2026 at 10:00 AM",
      "Final project due December 4, 2026",
    ];
    const events = extractEvents(lines.join("\n"), 2026);
    expect(withoutSource(events)).toEqual([
      { title: "Homework 1", kind: "assignment", date: "2026-09-28" },
      { title: "Midterm exam", kind: "exam", date: "2026-10-14", time: "10:00" },
      { title: "Final project", kind: "deadline", date: "2026-12-04" },
    ]);
    expect(events.map((e) => e.source)).toEqual(lines);
  });

  it("Task test 2: flags a relative date for review instead of guessing it", () => {
    const events = extractEvents("Quiz next Friday\nHomework 2 due October 5, 2026", 2026);
    expect(withoutSource(events)).toEqual([
      { title: "Quiz", kind: "quiz", date: "", needsReview: true },
      { title: "Homework 2", kind: "assignment", date: "2026-10-05" },
    ]);
  });

  it("Task test 3: proposes nothing for lines without dates and keeps accents and dashes", () => {
    expect(extractEvents("Office hours: Mondays 2-3 PM\nGrading: 40% projects", 2026)).toEqual([]);
    const [event] = extractEvents("Exposé – final draft due December 1, 2026", 2026);
    expect(event).toMatchObject({ title: "Exposé – final draft", kind: "deadline", date: "2026-12-01" });
  });

  it("ignores the acceptance test's syllabus heading, which has a year but no day", () => {
    const text = "CSE 442 Software Engineering - Fall 2026 Syllabus\nHomework 1 due September 28, 2026";
    expect(extractEvents(text, 2026).map((e) => e.title)).toEqual(["Homework 1"]);
  });

  it("reads other common date and time formats, using the given year when one is missing", () => {
    const events = extractEvents([
      "- Sept. 8: Quiz 1",
      "Lab 2 report due Fri, 10/9 by 11:59 p.m.",
      "2026-11-20 Project proposal",
      "Final exam: 15 December at noon",
      "| Week 3 | Sep 15 | HW 2 due |",
      "Paper due Oct 1 at midnight",
    ].join("\n"), 2026);
    expect(withoutSource(events)).toEqual([
      { title: "Quiz 1", kind: "quiz", date: "2026-09-08" },
      { title: "Lab 2 report", kind: "assignment", date: "2026-10-09", time: "23:59" },
      { title: "Project proposal", kind: "deadline", date: "2026-11-20" },
      { title: "Final exam", kind: "exam", date: "2026-12-15", time: "12:00" },
      { title: "HW 2", kind: "assignment", date: "2026-09-15" },
      { title: "Paper", kind: "deadline", date: "2026-10-01", time: "23:59" },
    ]);
  });

  it("flags impossible dates and lines with more than one date for review", () => {
    expect(withoutSource(extractEvents("Essay due February 30, 2026", 2026)))
      .toEqual([{ title: "Essay", kind: "deadline", date: "", needsReview: true }]);
    expect(extractEvents("Homework 3 assigned Sep 1, due Sep 8", 2026)[0])
      .toMatchObject({ date: "", needsReview: true });
  });

  it("skips bare fractions without an event word and duplicate events", () => {
    expect(extractEvents("Participation counts 1/2 of the grade", 2026)).toEqual([]);
    expect(extractEvents("Midterm exam October 14, 2026\nMidterm exam Oct 14", 2026)).toHaveLength(1);
  });
});

describe("normalizing proposed events (card 44)", () => {
  it("keeps valid fields and flags events without a real date", () => {
    expect(normalizeEvents([
      { title: "  Homework 1 ", kind: "assignment", date: "2026-09-28", time: "23:59", source: "HW1 due 9/28" },
      { title: "Quiz", kind: "pop quiz", date: "2026-02-30", time: "25:00" },
      { title: "Final", kind: "exam", date: "December 4" },
    ])).toEqual([
      { title: "Homework 1", kind: "assignment", date: "2026-09-28", time: "23:59", source: "HW1 due 9/28" },
      { title: "Quiz", kind: "other", date: "", source: "", needsReview: true },
      { title: "Final", kind: "exam", date: "", source: "", needsReview: true },
    ]);
  });

  it("drops untitled or malformed items, strips control characters, and caps the list", () => {
    expect(normalizeEvents("not a list")).toEqual([]);
    expect(normalizeEvents([null, 4, { title: "" }, { title: "\u0000​" }])).toEqual([]);
    expect(normalizeEvents([{ title: "Lab\u0007 1", date: "2026-09-01" }])[0].title).toBe("Lab 1");
    const many = Array.from({ length: MAX_SYLLABUS_EVENTS + 5 }, (_, i) => ({ title: `Quiz ${i}`, date: "2026-09-01" }));
    expect(normalizeEvents(many)).toHaveLength(MAX_SYLLABUS_EVENTS);
    expect(normalizeEvents([{ title: "x".repeat(300), date: "2026-09-01" }])[0].title).toHaveLength(255);
  });
});

describe("rules first, AI only when needed (card 44)", () => {
  const syllabus = [
    "CSE 442 Software Engineering, Fall 2026. Read this whole syllabus before the first class meeting.",
    "Homework 1 due September 28, 2026",
    "Midterm exam October 14, 2026 at 10:00 AM",
    "Final project due December 4, 2026",
  ].join("\n");

  it("keeps the rules' events when they read the syllabus cleanly, even a short one", () => {
    expect(rulesVerdict(syllabus, extractEvents(syllabus, 2026))).toBeNull();
    const short = "Homework 1 due September 28, 2026\nMidterm exam October 14, 2026";
    expect(rulesVerdict(short, extractEvents(short, 2026))).toBeNull();
    // No reader can turn "next Friday" into a date, so it is left for the student, not sent to the AI.
    const relative = `${short}\nQuiz 1 next Friday\nProject proposal TBA`;
    expect(rulesVerdict(relative, extractEvents(relative, 2026))).toBeNull();
  });

  it("asks for the AI reader when the rules find no text, no events, unsure dates, or undated items", () => {
    expect(rulesVerdict("", [])).toBe("no-text");
    const policies = "Attendance is expected at every lecture and lab section this semester. ".repeat(3);
    expect(rulesVerdict(policies, extractEvents(policies, 2026))).toBe("no-events");
    const clashing = `${syllabus}\nQuizzes on October 2 and October 9\nLabs due 10/16, 10/23\nDemos December 1 or December 3`;
    expect(rulesVerdict(clashing, extractEvents(clashing, 2026))).toBe("unsure");
    // A table the rules couldn't pair up: names on one line, dates on another.
    const split = `${syllabus}\nMidterm exam 2\nQuiz 3\nProject 2 due\nFinal exam\nOct 30 Nov 13 Dec 1 Dec 10`;
    expect(rulesVerdict(split, extractEvents(split, 2026))).toBe("missed");
  });

  it("flags AI dates that the file never mentions, and keeps dates it does", () => {
    const ai = [
      { title: "Midterm exam", kind: "exam" as const, date: "2026-10-14", source: "" },
      { title: "Quiz 9", kind: "quiz" as const, date: "2026-11-20", source: "" },
      { title: "Lab 1", kind: "assignment" as const, date: "", source: "", needsReview: true as const },
    ];
    expect(checkDates(ai, `${syllabus}\nLab 1 week 3`).map((e) => [e.title, e.needsReview ?? false])).toEqual([
      ["Midterm exam", false], ["Quiz 9", true], ["Lab 1", true],
    ]);
    expect(checkDates(ai.slice(0, 2), "10/14 midterm\n11-20")[1].needsReview).toBe(true);
    expect(checkDates(ai.slice(0, 2), "")).toEqual(ai.slice(0, 2));
  });

  it("adds dated items the rules found on days the AI reader left empty", () => {
    const rules = extractEvents(`${syllabus}\nOctober 1, 2026 Lecture: requirements`, 2026);
    const ai = [{ title: "Midterm", kind: "exam" as const, date: "2026-10-14", source: "Midterm exam October 14" }];
    expect(mergeEvents(ai, rules).map((e) => [e.title, e.date])).toEqual([
      ["Midterm", "2026-10-14"], ["Homework 1", "2026-09-28"], ["Final project", "2026-12-04"],
    ]);
  });
});
