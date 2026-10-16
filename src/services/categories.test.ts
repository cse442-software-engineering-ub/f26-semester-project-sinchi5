import { describe, expect, it } from "vitest";
import { groupNotesByCategory, isNoteCategory, NOTE_CATEGORIES } from "./categories";
import { seedNotes } from "./fixtures";
import type { Note } from "../domain";

const note = (title: string, category: string): Note => ({ ...seedNotes()[0], id: title, title, category, pinned: false });

describe("note categories (card 42)", () => {
  it("lists the four supported categories in display order", () => {
    expect(NOTE_CATEGORIES).toEqual(["School", "Work", "Meetings", "Personal"]);
    expect(isNoteCategory("Work")).toBe(true);
    for (const bad of ["work", "Vacation", "", undefined, 3]) expect(isNoteCategory(bad)).toBe(false);
  });

  it("groups notes in category order, counts each group, and leaves out empty categories", () => {
    const groups = groupNotesByCategory([
      note("Sprint plan", "Work"),
      note("Algebra review", "School"),
      note("Project minutes", "Meetings"),
      note("Physics lab", "School"),
    ]);
    expect(groups.map((g) => [g.category, g.notes.length])).toEqual([["School", 2], ["Work", 1], ["Meetings", 1]]);
    expect(groups[0].notes.map((n) => n.title)).toEqual(["Algebra review", "Physics lab"]);
  });

  it("puts each note in exactly one group and keeps the given order inside a group", () => {
    const input = [note("B", "Personal"), note("A", "Personal"), note("C", "Work")];
    const groups = groupNotesByCategory(input);
    expect(groups.flatMap((g) => g.notes)).toHaveLength(input.length);
    expect(groups.find((g) => g.category === "Personal")!.notes.map((n) => n.title)).toEqual(["B", "A"]);
  });

  it("treats a note with an unknown category as School and handles no notes", () => {
    expect(groupNotesByCategory([note("Legacy", "Vacation")])).toEqual([{ category: "School", notes: [note("Legacy", "Vacation")] }]);
    expect(groupNotesByCategory([])).toEqual([]);
  });
});
