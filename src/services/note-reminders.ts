import type { Note } from "../domain";

type ReminderNote = Pick<Note, "id" | "title" | "remindAt">;
const MAX_DELAY = 2_147_483_647;

export function showNoteNotification(note: ReminderNote) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(note.title, {
      body: "Your note reminder is due.",
      tag: `notely-note-${note.id}-${note.remindAt}`,
    });
  } catch {
    // A browser may withdraw notification support while the tab is open.
  }
}

// Keep timers across repository refreshes; replacing or removing a reminder cancels its old timer.
export function createReminderScheduler(notify: (note: ReminderNote) => void) {
  const timers = new Map<string, { at: string; title: string; handle: ReturnType<typeof setTimeout> }>();
  const fired = new Set<string>();

  function update(notes: ReminderNote[]) {
    const current = new Map(notes.map((note) => [note.id, note]));
    for (const [id, timer] of timers) {
      const note = current.get(id);
      if (note?.remindAt !== timer.at || note.title !== timer.title) {
        clearTimeout(timer.handle);
        timers.delete(id);
      }
    }
    for (const note of notes) {
      const at = note.remindAt;
      if (!at || timers.has(note.id) || fired.has(`${note.id}:${at}`)) continue;
      const due = Date.parse(at);
      if (!Number.isFinite(due) || due <= Date.now()) continue;
      const arm = () => {
        const remaining = due - Date.now();
        if (remaining <= 0) {
          timers.delete(note.id);
          fired.add(`${note.id}:${at}`);
          notify(note);
        } else {
          timers.set(note.id, {
            at, title: note.title,
            handle: setTimeout(arm, Math.min(remaining, MAX_DELAY)),
          });
        }
      };
      arm();
    }
  }

  function dispose() {
    for (const timer of timers.values()) clearTimeout(timer.handle);
    timers.clear();
  }
  return { update, dispose };
}
