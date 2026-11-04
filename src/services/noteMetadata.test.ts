import { describe, expect, it } from "vitest";
import { courses } from "./fixtures";
import { detectNoteMetadata } from "./noteMetadata";

describe("note metadata detection", () => {
  it.each(["CSE 442", "cse442", "CSE-442", "CSE_442"])("recognizes %s as exactly CSE 442", (code) => {
    const result = detectNoteMetadata(`Course: ${code}\nLecture date: September 14, 2026`, "lecture.txt", courses);
    expect(courses.find((c) => c.id === result.courseId)?.code).toBe("CSE 442");
    expect(result.lectureDate).toBe("2026-09-14");
  });

  it.each(["2026-09-14", "2026/9/14", "9/14/2026", "Sep. 14, 2026", "14 September 2026", "September 14th, 2026"])("normalizes %s without timezone shifts", (date) => {
    expect(detectNoteMetadata(`Date: ${date}`, "lecture.md", courses).lectureDate).toBe("2026-09-14");
  });

  it("prefers labeled metadata over other courses, deadlines and the filename", () => {
    expect(detectNoteMetadata(
      "Course: CSE 442\nDate: 2026-09-01\nLecture date: 2026-09-14\nCompare CSE 331. Assignment due 2026-09-21.",
      "CSE331_2026-09-02.txt", courses,
    )).toEqual({ courseId: "cse442", lectureDate: "2026-09-14" });
  });

  it("supports Markdown headers and standalone dates", () => {
    expect(detectNoteMetadata("# CSE 442\n## September 14, 2026\nScrum notes", "lecture.md", courses))
      .toEqual({ courseId: "cse442", lectureDate: "2026-09-14" });
  });

  it("falls back to explicit metadata in the filename", () => {
    expect(detectNoteMetadata("Scrum notes", "CSE_442_2026-09-14.pdf", courses))
      .toEqual({ courseId: "cse442", lectureDate: "2026-09-14" });
  });

  it.each([
    "Nothing to detect", "XCSE442 and CSE4420", "Course: BIO 999",
    "CSE 442 and CSE 331", "Course: BIO 999\nDiscuss CSE 442",
  ])("does not invent a course for %s", (text) => {
    expect(detectNoteMetadata(text, "lecture.txt", courses).courseId).toBe("");
  });

  it.each([
    "No date", "Assignment due: 2026-09-14", "Lecture date: September 14",
    "Lecture date: 2026-02-30", "Date: 2025-02-29", "Date: 14/9/2026",
    "Date: 2026-09-14\nDate: 2026-09-15",
    "Lecture date: unknown\nDate: 2026-09-14",
  ])("does not invent a lecture date for %s", (text) => {
    expect(detectNoteMetadata(text, "lecture.txt", courses).lectureDate).toBe("");
  });

  it("accepts a valid leap day and repeated consistent metadata", () => {
    expect(detectNoteMetadata("CSE442 CSE 442\nDate: 2024-02-29\nDate: February 29, 2024", "lecture.txt", courses))
      .toEqual({ courseId: "cse442", lectureDate: "2024-02-29" });
  });
});
