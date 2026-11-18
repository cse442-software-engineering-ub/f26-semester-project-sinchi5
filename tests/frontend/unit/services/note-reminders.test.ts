import { afterEach, expect, it, vi } from "vitest";
import { createReminderScheduler, showNoteNotification } from "../../../../src/services/note-reminders";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("fires once at the selected time across refreshes and cancels a removed reminder", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
  const notify = vi.fn();
  const scheduler = createReminderScheduler(notify);
  const first = { id: "1", title: "Submit lab report", remindAt: "2026-11-13T12:02:00.000Z" };
  scheduler.update([first]);
  scheduler.update([{ ...first }]);
  vi.advanceTimersByTime(119_999);
  expect(notify).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(notify).toHaveBeenCalledExactlyOnceWith(first);
  scheduler.update([first]);
  expect(notify).toHaveBeenCalledTimes(1);

  const changed = { ...first, remindAt: "2026-11-13T12:07:00.000Z" };
  scheduler.update([changed]);
  scheduler.update([{ ...changed, remindAt: null }]);
  vi.advanceTimersByTime(5 * 60_000);
  expect(notify).toHaveBeenCalledTimes(1);
  scheduler.dispose();
});

it("reschedules a changed reminder and ignores already elapsed times", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
  const notify = vi.fn();
  const scheduler = createReminderScheduler(notify);
  scheduler.update([{ id: "1", title: "Old", remindAt: "2026-11-13T12:02:00.000Z" }]);
  const changed = { id: "1", title: "New title", remindAt: "2026-11-13T12:03:00.000Z" };
  scheduler.update([changed]);
  vi.advanceTimersByTime(2 * 60_000);
  expect(notify).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60_000);
  expect(notify).toHaveBeenCalledExactlyOnceWith(changed);
  scheduler.update([{ id: "2", title: "Past", remindAt: "2000-01-01T00:00:00.000Z" }]);
  expect(notify).toHaveBeenCalledTimes(1);
  scheduler.dispose();
});

it("uses the note title for a granted browser notification", () => {
  const create = vi.fn();
  vi.stubGlobal("Notification", Object.assign(create, { permission: "granted" }));
  showNoteNotification({ id: "1", title: "Submit lab report", remindAt: "2026-11-13T12:02:00.000Z" });
  expect(create).toHaveBeenCalledWith("Submit lab report", expect.objectContaining({ body: "Your note reminder is due." }));
});
