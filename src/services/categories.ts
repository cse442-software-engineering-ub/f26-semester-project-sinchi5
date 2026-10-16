import type { Note } from "../domain";

// The only note categories (cards 39-42). The PHP API accepts exactly these, in this order.
export const NOTE_CATEGORIES = ["School", "Work", "Meetings", "Personal"] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export function isNoteCategory(value: unknown): value is NoteCategory {
  return typeof value === "string" && (NOTE_CATEGORIES as readonly string[]).includes(value);
}

// Groups notes under their category in the fixed category order, keeping each group's notes
// in the order they were given (so the current sort and pinning still apply inside a group).
// Empty categories are left out. A note with an unknown category counts as School, the default.
export function groupNotesByCategory(notes: Note[]): { category: NoteCategory; notes: Note[] }[] {
  return NOTE_CATEGORIES.map((category) => ({
    category,
    notes: notes.filter((note) => (isNoteCategory(note.category) ? note.category : "School") === category),
  })).filter((group) => group.notes.length > 0);
}
