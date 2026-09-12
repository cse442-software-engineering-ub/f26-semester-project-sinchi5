import { describe, expect, it } from "vitest";
import { createRepositories, filterNotes } from "./repositories";
import { seedNotes, dateKey } from "./fixtures";
function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) || null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}
describe("repository contracts", () => {
  it("combines keyword, course, visibility, category and date filters", () => {
    const notes = seedNotes();
    expect(
      filterNotes(notes, {
        q: "scrum",
        course: "cse442",
        visibility: "shared",
        category: "School",
        from: notes[0].lectureDate,
        to: notes[0].lectureDate,
      }),
    ).toHaveLength(1);
    expect(
      filterNotes(notes, { q: "scrum", visibility: "private" }),
    ).toHaveLength(0);
    expect(
      filterNotes(notes, { q: "Algorithms" }).map((n) => n.courseId),
    ).toEqual(["cse331"]);
  });
  it("sorts alphabetically and by creation date without mutating input", () => {
    const notes = seedNotes();
    const names = filterNotes(notes, { sort: "title" }).map((n) => n.title);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(filterNotes(notes, { sort: "created" })[0].createdAt).toBe(
      notes[0].createdAt,
    );
    expect(notes[0].id).toBe("note-1");
  });
  it("persists notes, sessions and onboarding across repository instances", async () => {
    const storage = memory();
    const r = createRepositories(storage);
    await r.auth.signIn("student@example.edu", "Student");
    await r.auth.completeOnboarding();
    const n = await r.notes.create({ title: "Persistent thought" });
    const next = createRepositories(storage);
    expect((await next.notes.get(n.id)).title).toBe("Persistent thought");
    expect((await next.auth.session())?.name).toBe("Student");
    expect((await next.auth.onboarding()).completed).toBe(true);
    await next.auth.signOut();
    expect(await next.auth.session()).toBeNull();
  });
  it("keeps history when restoring and refuses private-note comments", async () => {
    const r = createRepositories();
    const n = await r.notes.create({ title: "Original", body: "first" });
    await expect(r.notes.comment(n.id, "hello")).rejects.toThrow("Share");
    await r.notes.save({
      ...n,
      title: "Changed",
      body: "second",
      visibility: "shared",
    });
    await r.notes.comment(n.id, "Useful!");
    const versions = await r.notes.versions(n.id);
    const restored = await r.notes.restore(n.id, versions[0].id);
    expect(restored.body).toBe("first");
    expect(
      (await r.notes.versions(n.id)).some((v) => v.body === "second"),
    ).toBe(true);
    expect(await r.notes.comments(n.id)).toHaveLength(1);
  });
  it("validates uploads, supports partial/failure states and confirms imports", async () => {
    const r = createRepositories();
    expect(
      r.imports.validate({ name: "bad.exe", size: 10 }, "document"),
    ).toBeTruthy();
    expect(
      r.imports.validate({ name: "empty.pdf", size: 0 }, "document"),
    ).toBeTruthy();
    expect(
      r.imports.validate(
        { name: "big.pdf", size: 21 * 1024 * 1024 },
        "document",
      ),
    ).toBeTruthy();
    expect(
      r.imports.validate({ name: "paper.pdf", size: 30 }, "scan"),
    ).toBeTruthy();
    const failed = await r.imports.start(
      { name: "paper.pdf", size: 30 },
      "document",
      "failure",
    );
    await expect(r.imports.confirm(failed)).rejects.toThrow();
    const job = await r.imports.start(
      { name: "syllabus.pdf", size: 30 },
      "syllabus",
      "partial",
    );
    expect(job.state).toBe("partial");
    job.events[0].title = "Reviewed assignment";
    await r.imports.confirm(job);
    expect(
      (await r.schedule.list()).some(
        (e) => e.title === "Reviewed assignment" && e.source === "imported",
      ),
    ).toBe(true);
  });
  it("groups lecture folders and resolves exact lecture links", async () => {
    const r = createRepositories();
    const event = {
      id: "",
      courseId: "cse442",
      title: "Lecture",
      date: dateKey(),
      time: "10:00",
      kind: "lecture" as const,
      source: "manual" as const,
      location: "",
      description: "",
    };
    const saved = await r.schedule.save(event);
    expect(saved.id).toBeTruthy();
    expect(await r.schedule.lectureNotes(saved)).toHaveLength(1);
    expect((await r.courses.folders("cse442"))[dateKey()]).toHaveLength(1);
  });
  it("recovers corrupted storage and reports write failures", async () => {
    const r = createRepositories({
      getItem: () => "{invalid",
      setItem: () => {
        throw Error("quota");
      },
    });
    expect(await r.notes.list()).toHaveLength(6);
    await expect(r.notes.create({})).rejects.toThrow("storage");
  });
});
