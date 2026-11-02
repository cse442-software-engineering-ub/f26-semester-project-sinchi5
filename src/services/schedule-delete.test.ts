// Card 173: removing an event from the schedule. Kept out of repositories.test.ts, whose test count
// other cards quote.
import { describe, expect, it } from "vitest";
import { createRepositories } from "./repositories";
import { NoteServiceError } from "./notes-http";
import type { CourseEvent, Repositories } from "../domain";

const student = { id: "student-173", name: "Event Deleter", email: "deleter@example.edu" };
const storageMessage = "Your browser storage is full or unavailable. Changes could not be saved.";

function memory() {
  const data = new Map<string, string>();
  let failNext = false;
  return {
    failNextSave: () => { failNext = true; },
    getItem: (k: string) => data.get(k) || null,
    setItem: (k: string, v: string) => {
      if (failNext) {
        failNext = false;
        throw Error("quota");
      }
      data.set(k, v);
    },
  };
}
const event = (title: string, date: string, time: string, source: CourseEvent["source"] = "manual", id = ""): CourseEvent => ({
  id, courseId: "", title, kind: "other", date, time, location: "", description: "", source,
});
// Stands in for the PHP API's events and event-delete routes (cards 48 and 172).
function server(failWith?: Error, events = [event("Quiz 1", "2026-11-12", "", "imported", "41"), event("Project draft", "2026-11-19", "", "imported", "42")]) {
  const deletes: string[] = [];
  return {
    deletes,
    api: {
      events: async () => events.map((e) => ({ ...e })),
      deleteEvent: async (id: string, wholeSeries = false) => {
        deletes.push(wholeSeries ? `${id} series` : id);
        if (failWith) throw failWith;
        const found = events.find((e) => e.id === id)!;
        for (const e of wholeSeries ? events.filter((x) => x.seriesId === found.seriesId) : [found]) events.splice(events.indexOf(e), 1);
      },
    } as never,
  };
}
const titles = async (r: Repositories) => (await r.schedule.list()).map((e) => e.title);

describe("deleting a schedule event (card 173)", () => {
  it("Task test 1 - removes only the chosen hand-made event, and it stays gone after a reload", async () => {
    const storage = memory();
    const r = createRepositories(storage, student, false);
    const study = await r.schedule.save(event("Study group", "2026-11-05", "18:00"));
    await r.schedule.save(event("Assignment draft", "2026-11-05", "23:59"));
    await r.schedule.remove(study);
    expect(await titles(r)).toEqual(["Assignment draft"]);
    expect(await titles(createRepositories(storage, student, false))).toEqual(["Assignment draft"]);
  });

  it("Task test 2 - deletes a syllabus event on the server and its edited copy here", async () => {
    const storage = memory();
    const { api, deletes } = server();
    const r = createRepositories(storage, student, false, undefined, api);
    const [quiz] = await r.schedule.list();
    const edited = await r.schedule.save({ ...quiz, title: "Quiz 1 updated" });
    await r.schedule.remove(edited);
    expect(deletes).toEqual(["41"]);
    expect(await titles(r)).toEqual(["Project draft"]);
    expect(await titles(createRepositories(storage, student, false, undefined, api))).toEqual(["Project draft"]);
  });

  it("Task test 2 - a syllabus event already gone from the server (404) still leaves the schedule", async () => {
    const storage = memory();
    const { api, deletes } = server(new NoteServiceError("This event could not be found.", 404));
    const r = createRepositories(storage, student, false, undefined, api);
    const [quiz] = await r.schedule.list();
    await r.schedule.save({ ...quiz, title: "Quiz 1 updated" });
    await r.schedule.remove(quiz);
    expect(deletes).toEqual(["41"]);
    expect(await titles(r)).not.toContain("Quiz 1 updated");
  });

  it("Task test 3 - a failed server delete keeps the syllabus event and its edit", async () => {
    const storage = memory();
    const { api } = server(new NoteServiceError("Uploads are unavailable right now. Please try again later.", 503));
    const r = createRepositories(storage, student, false, undefined, api);
    const [quiz] = await r.schedule.list();
    const edited = await r.schedule.save({ ...quiz, title: "Quiz 1 updated" });
    await expect(r.schedule.remove(edited)).rejects.toThrow("Uploads are unavailable right now. Please try again later.");
    expect(await titles(r)).toEqual(["Quiz 1 updated", "Project draft"]);
  });

  it("Task test 3 - a failed browser save keeps the hand-made event", async () => {
    const storage = memory();
    const r = createRepositories(storage, student, false);
    const study = await r.schedule.save(event("Study group", "2026-11-05", "18:00"));
    storage.failNextSave();
    await expect(r.schedule.remove(study)).rejects.toThrow(storageMessage);
    expect(await titles(r)).toEqual(["Study group"]);
    expect(await titles(createRepositories(storage, student, false))).toEqual(["Study group"]);
  });

  it("deletes one meeting of a weekly class or all of them, with their edited copies, and nothing else (card 48)", async () => {
    const meeting = (title: string, id: string, seriesId: string): CourseEvent => ({ ...event(title, `2026-11-${id}`, "10:00", "imported", id), seriesId });
    const storage = memory();
    const { api, deletes } = server(undefined, [meeting("Lecture 1", "11", "7-0"), meeting("Lecture 2", "12", "7-0"), meeting("Lecture 3", "13", "7-0"), meeting("Lab", "14", "7-1")]);
    const r = createRepositories(storage, student, false, undefined, api);
    const [first, second, third] = await r.schedule.list();
    await r.schedule.remove(first);
    expect(await titles(r)).toEqual(["Lecture 2", "Lecture 3", "Lab"]);
    // An edit made in this browser goes with the rest of its class.
    await r.schedule.save({ ...third, title: "Lecture 3 moved" });
    await r.schedule.remove(second, true);
    expect(deletes).toEqual(["11", "12 series"]);
    expect(await titles(r)).toEqual(["Lab"]);
    expect(await titles(createRepositories(storage, student, false, undefined, api))).toEqual(["Lab"]);
  });

  it("keeps the rest of a class and its edits when the chosen meeting is already gone from the server (card 48)", async () => {
    const meeting = (title: string, id: string, seriesId: string): CourseEvent => ({ ...event(title, `2026-11-${id}`, "10:00", "imported", id), seriesId });
    const storage = memory();
    const { api } = server(new NoteServiceError("This event could not be found.", 404), [meeting("Lecture 1", "11", "7-0"), meeting("Lecture 2", "12", "7-0")]);
    const r = createRepositories(storage, student, false, undefined, api);
    const [first, second] = await r.schedule.list();
    await r.schedule.save({ ...second, title: "Lecture 2 moved" });
    await r.schedule.remove(first, true);
    expect(await titles(r)).toEqual(["Lecture 1", "Lecture 2 moved"]);
  });

  it("removes a whole class in the demo workspace, and an event outside a series only removes itself (card 48)", async () => {
    const r = createRepositories();
    const before = (await r.schedule.list()).length;
    const [one] = [await r.schedule.save({ ...event("Lecture 1", "2026-11-02", "10:00", "imported"), seriesId: "9-0" }),
      await r.schedule.save({ ...event("Lecture 2", "2026-11-04", "10:00", "imported"), seriesId: "9-0" })];
    const alone = await r.schedule.save(event("Study group", "2026-11-05", "18:00"));
    await r.schedule.remove(alone, true);
    expect((await r.schedule.list()).length).toBe(before + 2);
    await r.schedule.remove(one, true);
    expect((await r.schedule.list()).length).toBe(before);
  });

  it("removes a demo workspace event without calling the server", async () => {
    const r = createRepositories();
    const [first, ...rest] = await r.schedule.list();
    await r.schedule.remove(first);
    expect((await r.schedule.list()).map((e) => e.id)).toEqual(rest.map((e) => e.id));
  });
});
