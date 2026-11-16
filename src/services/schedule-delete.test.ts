// Card 173: removing an event from the schedule. Kept out of repositories.test.ts, whose test count
// other cards quote. Since card 142 every event, hand-made or from a syllabus, is deleted on the server.
import { describe, expect, it } from "vitest";
import { createRepositories } from "./repositories";
import { NoteServiceError } from "./notes-http";
import { fakeApi } from "./server-testkit";
import type { CourseEvent, Repositories } from "../domain";

const event = (title: string, date: string, time: string, source: CourseEvent["source"] = "manual", id = ""): CourseEvent => ({
  id, courseId: "cse442", title, kind: "other", date, time, location: "", description: "", source,
});
const server = (events = [event("Quiz 1", "2026-11-12", "", "imported", "41"), event("Project draft", "2026-11-19", "", "imported", "42")]) => fakeApi({ events });
const titles = async (r: Pick<Repositories, "schedule">) => (await r.schedule.list()).map((e) => e.title);
const deletes = (api: ReturnType<typeof fakeApi>) => api.calls.filter((c) => c.route === "event-delete").map((c) => c.body);

describe("deleting a schedule event (card 173)", () => {
  it("Task test 1 - removes only the chosen hand-made event, and it stays gone after a reload", async () => {
    const api = server([]);
    const r = createRepositories(api);
    const study = await r.schedule.save(event("Study group", "2026-11-05", "18:00"));
    await r.schedule.save(event("Assignment draft", "2026-11-05", "23:59"));
    await r.schedule.remove(study);
    expect(deletes(api)).toEqual([{ id: study.id }]);
    expect(await titles(r)).toEqual(["Assignment draft"]);
    expect(await titles(createRepositories(api))).toEqual(["Assignment draft"]);
  });

  it("Task test 2 - deletes an edited syllabus event on the server", async () => {
    const api = server();
    const r = createRepositories(api);
    const [quiz] = await r.schedule.list();
    const edited = await r.schedule.save({ ...quiz, title: "Quiz 1 updated" });
    await r.schedule.remove(edited);
    expect(deletes(api)).toEqual([{ id: "41" }]);
    expect(await titles(createRepositories(api))).toEqual(["Project draft"]);
  });

  it("Task test 2 - an event already gone from the server (404) still leaves the schedule", async () => {
    const api = server();
    const r = createRepositories(api);
    const [quiz] = await r.schedule.list();
    await r.schedule.remove(quiz);
    await expect(r.schedule.remove(quiz)).resolves.toBeUndefined();
    expect(await titles(r)).toEqual(["Project draft"]);
  });

  it("Task test 3 - a failed server delete keeps the event", async () => {
    const api = server();
    const r = createRepositories(api);
    const study = await r.schedule.save(event("Study group", "2026-11-05", "18:00"));
    api.failWhen = (route) => route === "event-delete" ? new NoteServiceError("Your courses and events are unavailable right now. Please try again later.", 503) : undefined;
    await expect(r.schedule.remove(study)).rejects.toThrow("Your courses and events are unavailable right now. Please try again later.");
    expect(await titles(r)).toEqual(["Study group", "Quiz 1", "Project draft"]);
  });

  it("deletes one meeting of a weekly class or all of them, and nothing else (card 48)", async () => {
    const meeting = (title: string, id: string, seriesId: string): CourseEvent => ({ ...event(title, `2026-11-${id}`, "10:00", "imported", id), seriesId });
    const api = server([meeting("Lecture 1", "11", "7-0"), meeting("Lecture 2", "12", "7-0"), meeting("Lecture 3", "13", "7-0"), meeting("Lab", "14", "7-1")]);
    const r = createRepositories(api);
    const [first, second] = await r.schedule.list();
    await r.schedule.remove(first);
    expect(await titles(r)).toEqual(["Lecture 2", "Lecture 3", "Lab"]);
    await r.schedule.remove(second, true);
    expect(deletes(api)).toEqual([{ id: "11" }, { id: "12", series: true }]);
    expect(await titles(r)).toEqual(["Lab"]);
  });

  it("asks for the whole class only when the event is part of one (card 48)", async () => {
    const api = server([]);
    const r = createRepositories(api);
    const alone = await r.schedule.save(event("Study group", "2026-11-05", "18:00"));
    await r.schedule.remove(alone, true);
    expect(deletes(api)).toEqual([{ id: alone.id }]);
  });
});
