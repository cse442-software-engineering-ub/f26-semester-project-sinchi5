import type { ChecklistItem } from "../domain";

export type ChecklistDraft = ChecklistItem & { key: string };

// Task #78: identities exist only in the editor, so deleting a row cannot reuse
// another row's React/input state. Supports Task Tests 2–3 and Story #19 AT2.
export function checklistDraft(items: ChecklistItem[] = []): ChecklistDraft[] {
  return items.map((item) => ({ ...item, key: crypto.randomUUID() }));
}

// Task #78 / Story #19 AT3: discard blank drafts at the persistence boundary;
// keep meaningful text, exact booleans and order, and never send local identities.
export function checklistPayload(items: ChecklistItem[]): ChecklistItem[] {
  return items.filter((item) => item.text.trim()).map(({ text, done }) => ({ text, done }));
}
