import { describe, expect, it } from "vitest";
import { createRepositories, filterNotes } from "./repositories";
import { seedNotes, dateKey } from "./fixtures";
import type { Repositories } from "../domain";
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
    expect(filterNotes(notes, { q: "recursion" }).map((n) => n.id)).toEqual(["note-2"]);
    expect(filterNotes(notes, { q: "TRANSPARENCY" }).map((n) => n.id)).toEqual(["note-1"]);
    expect(filterNotes(notes, { q: "teamwork" }).map((n) => n.id)).toEqual(["note-1"]);
    expect(filterNotes(notes, { q: "CSE 442" })).toEqual([]);
    expect(filterNotes(notes, { q: "Personal" })).toEqual([]);
    const specialNotes = [
      { ...notes[0], title: "Score 50% done", body: "", tags: [] },
      { ...notes[1], title: "History Notes", body: "", tags: ["mid!term"] },
    ];
    expect(filterNotes(specialNotes, { q: "50%" })).toEqual([specialNotes[0]]);
    expect(filterNotes(specialNotes, { q: "_" })).toEqual([]);
    expect(filterNotes(specialNotes, { q: "MID!TERM" })).toEqual([specialNotes[1]]);
  });
  it("sorts alphabetically and by creation date without mutating input", () => {
    const notes = seedNotes().map((n) => ({ ...n, pinned: false }));
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
    await r.auth.startDemo();
    await r.auth.completeOnboarding();
    const n = await r.notes.create({ title: "Persistent thought" });
    const next = createRepositories(storage);
    expect((await next.notes.get(n.id)).title).toBe("Persistent thought");
    expect((await next.auth.session())?.name).toBe("Erin");
    expect((await next.auth.onboarding()).completed).toBe(true);
    await next.auth.signOut();
    expect(await next.auth.session()).toBeNull();
  });
  it("keeps history when restoring and refuses private-note comments", async () => {
    const r = createRepositories();
    // Task #65 requires an authenticated user for every comment attempt,
    // so this test now starts as the demo user first - it previously
    // exercised commenting as no one at all, which the new permission gate
    // no longer allows.
    await r.auth.startDemo();
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
    const paper = new File(["paper"], "paper.pdf");
    const queued = await r.imports.start(paper, "document", "failure");
    expect(queued.state).toBe("queued");
    const failed = await r.imports.process(queued, "failure");
    await expect(r.imports.confirm(failed)).rejects.toThrow();
    const syllabus = new File(["syllabus"], "syllabus.txt");
    const job = await r.imports.process(await r.imports.start(syllabus, "syllabus"), "partial");
    expect(job.state).toBe("partial");
    job.events[0].title = "Reviewed assignment";
    await r.imports.confirm(job);
    expect(
      (await r.schedule.list()).some(
        (e) => e.title === "Reviewed assignment" && e.source === "imported",
      ),
    ).toBe(true);
  });
  it("sends every syllabus to the server's reader with the course term's year (card 45)", async () => {
    const calls: string[] = [];
    const server = {
      upload: async (file: File, courseId: string) => { calls.push(`upload ${file.name} ${courseId}`); return { id: "7" }; },
      extract: async (id: string, year: number) => {
        calls.push(`extract ${id} ${year}`);
        return { events: [
          { title: " Midterm exam ", kind: "exam", date: "2026-10-14", time: "10:00", location: "Knox 110", source: "p. 2" },
          { title: "Final exam", kind: "exam", date: "", time: "", location: "", source: "Final exam: TBA" },
          { title: "" },
        ] };
      },
    } as never;
    const r = createRepositories(undefined, undefined, true, undefined, server);
    const started: string[] = [];
    const file = new File(["CSE 442 Syllabus"], "cse442-syllabus.txt");
    const queued = await r.imports.start(file, "syllabus", "success", "cse442");
    expect([queued.id, queued.state, queued.metadata.courseId]).toEqual(["7", "queued", "cse442"]);
    const job = await r.imports.process(queued, "success", () => started.push("reading"));
    // The CSE 442 sample course is in Fall 2026, and even a text file goes to the reader.
    expect(calls).toEqual(["upload cse442-syllabus.txt cse442", "extract 7 2026"]);
    expect(started).toEqual(["reading"]);
    expect(job.reader).toBe("ai");
    // An exam with no posted date is listed unchecked, so the student sees it without having to act on it.
    expect(job.state).toBe("partial");
    expect(job.events).toEqual([
      { id: "", courseId: "cse442", title: "Midterm exam", kind: "exam", date: "2026-10-14", time: "10:00", location: "Knox 110", description: "p. 2", source: "imported" },
      { id: "", courseId: "cse442", title: "Final exam", kind: "exam", date: "", time: "", location: "", description: "Final exam: TBA", source: "imported", needsReview: true, include: false },
    ]);
    expect((await r.imports.process(job, "failure")).state).toBe("failed");
    expect(calls).toHaveLength(2);
  });
  it("turns the reader's weekly classes into review rows (card 44)", async () => {
    const lecture = { title: "Lecture", kind: "lecture", section: "", days: [1, 3], time: "10:00", location: "Davis 101", firstDate: "2026-08-24", lastDate: "2026-12-04", source: "MW 10:00" };
    const section = (name: string) => ({ ...lecture, title: "Lab", kind: "lab", section: name, days: [2], firstDate: "", lastDate: "", source: name });
    const server = {
      upload: async () => ({ id: "8" }),
      extract: async () => ({ isSyllabus: true, meetings: [lecture, section("A1"), section("A2"), { ...section("R1"), title: "Recitation", kind: "recitation" }],
        noClassDates: [{ from: "2026-11-25", to: "2026-11-27" }], events: [] }),
    } as never;
    const r = createRepositories(undefined, undefined, true, undefined, server);
    const course = await r.courses.create({ code: "CSE 442", name: "Software Engineering", color: "#000000", term: "Fall 2026", classesStart: "2026-08-31", classesEnd: "2026-12-11" });
    const file = new File(["syllabus"], "syllabus.txt");
    const job = await r.imports.process(await r.imports.start(file, "syllabus", "success", course.id));
    expect(job.state).toBe("review");
    expect(job.isSyllabus).toBe(true);
    expect(job.noClassDates).toEqual([{ from: "2026-11-25", to: "2026-11-27" }]);
    expect(job.meetings!.map((m) => [m.title, m.days, m.time, m.location, m.starts, m.ends, m.include])).toEqual([
      // The syllabus's own dates come first; a class with none falls back to the course's.
      ["Lecture", [1, 3], "10:00", "Davis 101", "2026-08-24", "2026-12-04", true],
      // Two labs are a choice, so neither is assumed. One recitation is just the recitation.
      ["Lab A1", [2], "10:00", "Davis 101", "2026-08-31", "2026-12-11", false],
      ["Lab A2", [2], "10:00", "Davis 101", "2026-08-31", "2026-12-11", false],
      ["Recitation R1", [2], "10:00", "Davis 101", "2026-08-31", "2026-12-11", true],
    ]);
  });
  it("reports when the reader says a file isn't a syllabus, or finds nothing (card 44)", async () => {
    let read: unknown = { isSyllabus: false, meetings: [], noClassDates: [], events: [] };
    const server = { upload: async () => ({ id: "9" }), extract: async () => read } as never;
    const r = createRepositories(undefined, undefined, true, undefined, server);
    const file = new File(["resume"], "resume.txt");
    const notSyllabus = await r.imports.process(await r.imports.start(file, "syllabus", "success", "cse442"));
    expect([notSyllabus.state, notSyllabus.isSyllabus, notSyllabus.events, notSyllabus.meetings]).toEqual(["review", false, [], []]);
    read = { isSyllabus: true, meetings: [], noClassDates: [], events: [] };
    const nothing = await r.imports.process(await r.imports.start(file, "syllabus", "success", "cse442"));
    expect([nothing.state, nothing.isSyllabus, nothing.events, nothing.meetings]).toEqual(["review", true, [], []]);
  });
  it("saves a signed-in student's included events on the server and lists them (card 48)", async () => {
    const confirmed: unknown[] = [];
    const midterm = { id: "41", courseId: "cse442", title: "Midterm exam", kind: "exam" as const, date: "2026-10-14",
      time: "10:00", location: "", description: "", source: "imported" as const };
    const server = {
      upload: async () => ({ id: "9" }),
      extract: async () => ({ events: [
        { title: "Homework 1", kind: "assignment", date: "2026-09-28", time: "", location: "", source: "" },
        { title: "Final project", kind: "deadline", date: "2026-12-04", time: "", location: "", source: "" },
      ] }),
      confirm: async (...args: unknown[]) => { confirmed.push(args); return 1; },
      events: async () => [midterm],
    } as never;
    const r = createRepositories(undefined, undefined, false, undefined, server);
    const file = new File(["syllabus"], "cse442-syllabus.txt");
    const job = await r.imports.process(await r.imports.start(file, "syllabus", "success", "cse442"));
    job.events[1].include = false;
    await r.imports.confirm(job);
    expect(confirmed).toEqual([["9", "cse442", [{ title: "Homework 1", kind: "assignment", date: "2026-09-28", time: "", location: "" }]]]);
    expect(await r.schedule.list("2026-10-01", "2026-10-31")).toEqual([midterm]);
    // A local edit of an imported event replaces the server copy instead of showing both.
    await r.schedule.save({ ...midterm, title: "Midterm exam (room 101)" });
    expect((await r.schedule.list()).map((e) => e.title)).toEqual(["Midterm exam (room 101)"]);
  });
  it("passes on the reader's reason when it can't read a file (card 45)", async () => {
    const server = {
      upload: async () => ({ id: "10" }),
      extract: async () => { throw new Error("You can read 10 syllabi automatically each day. Try again tomorrow."); },
    } as never;
    const r = createRepositories(undefined, undefined, true, undefined, server);
    const file = new File(["syllabus"], "syllabus.txt");
    const queued = await r.imports.start(file, "syllabus", "success", "cse442");
    await expect(r.imports.process(queued)).rejects.toThrow("You can read 10 syllabi automatically each day. Try again tomorrow.");
  });
  it("shows sample events in the demo, which has no server to read a file (card 45)", async () => {
    const r = createRepositories();
    const file = new File(["syllabus"], "syllabus.txt");
    const job = await r.imports.process(await r.imports.start(file, "syllabus"));
    expect([job.reader, job.notice]).toEqual(["sample", "This preview shows sample events. Sign in to read your own syllabus."]);
    expect(job.events.map((e) => e.title)).toEqual(["Assignment 1", "Midterm exam"]);
  });
  it("names what a renamed or damaged file really is, before uploading (card 45)", async () => {
    let uploads = 0;
    const server = { upload: async () => ({ id: String(++uploads) }) } as never;
    const r = createRepositories(undefined, undefined, true, undefined, server);
    const pdf = "%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n";
    for (const [name, content, message] of [
      ["syllabus.docx", pdf, "This file is named .docx, but it is really a PDF. Rename it to end in .pdf, then choose it again."],
      ["syllabus.pdf", pdf.slice(0, 20), "This PDF looks cut off. Download it again, then upload the new copy."],
      ["syllabus.jpg", "\0\0\0\x18ftypheic", "This file is named .jpg, but it is really a HEIC photo. Notely can't read HEIC photos. Take a screenshot of it, or export it as a JPG."],
      ["syllabus.pdf", "MZ\x90\0 program", "This doesn't look like a real PDF. Open it and save or export it again as a PDF, then upload that."],
      ["syllabus.txt", "\xD0\xCF\x11\xE0\0\0", "This file is named .txt, but it is really an older Word file (.doc) or a locked document. Open it in Word or Google Docs, remove any password, and save it as .docx or PDF."],
    ]) {
      const file = new File([Uint8Array.from(content, (c) => c.charCodeAt(0))], name);
      await expect(r.imports.start(file, "syllabus", "success", "cse442")).rejects.toThrow(message);
    }
    expect(uploads).toBe(0);
    const good = new File([pdf], "syllabus.pdf");
    expect((await r.imports.start(good, "syllabus", "success", "cse442")).id).toBe("1");
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
  it("allows an edit-level collaborator to save note changes", async () => {
    const storage = memory();
    const owner = createRepositories(storage, { id: "owner", name: "Owner", email: "owner@example.edu" });

    const note = await owner.notes.create({
      title: "Shared Note",
      body: "Original content",
      visibility: "shared",
    });
    // Server authentication supplies the current user to the prototype workspace.
    const r = createRepositories(storage, { id: "classmate-jamie", name: "Jamie", email: "jamie@example.edu" });
    expect(note.ownerId).not.toBe((await r.auth.session())?.id);

    await r.notes.inviteCollaborator(
      note.id,
      "jamie@example.edu",
    );

    await r.notes.setCollaboratorPermission(
      note.id,
      "classmate-jamie",
      "edit",
    );

    const saved = await r.notes.save({
      ...note,
      body: "Edited by Jamie",
    });

    expect(saved.body).toBe("Edited by Jamie");
    expect((await r.notes.get(note.id)).body).toBe("Edited by Jamie");
  });
  it("rejects edits from a view-level collaborator", async () => {
    const storage = memory();
    const owner = createRepositories(storage, { id: "owner", name: "Owner", email: "owner@example.edu" });

    const note = await owner.notes.create({
      title: "Shared Note",
      body: "Original content",
      visibility: "shared",
    });
    const r = createRepositories(storage, { id: "classmate-jamie", name: "Jamie", email: "jamie@example.edu" });
    expect(note.ownerId).not.toBe((await r.auth.session())?.id);

    await r.notes.inviteCollaborator(
      note.id,
      "jamie@example.edu",
    );

    await r.notes.setCollaboratorPermission(
      note.id,
      "classmate-jamie",
      "view",
    );

    await expect(
      r.notes.save({
        ...note,
        body: "This should not be saved",
      }),
    ).rejects.toThrow("permission");

    expect((await r.notes.get(note.id)).body).toBe(
      "Original content",
    );
  });

});

describe("note pinning", () => {
  it.each([undefined, "modified", "created", "title"])(
    "puts pins first and preserves the %s sort within both groups",
    (sort) => {
      const notes = seedNotes().map((n, i) => ({
        ...n,
        title: `Note ${String.fromCharCode(70 - i)}`,
        pinned: i === 2 || i === 4,
      }));
      const before = structuredClone(notes);
      const normal = filterNotes(notes.map((n) => ({ ...n, pinned: false })), { sort });
      const pinnedIds = new Set(notes.filter((n) => n.pinned).map((n) => n.id));
      expect(filterNotes(notes, { sort }).map((n) => n.id)).toEqual([
        ...normal.filter((n) => pinnedIds.has(n.id)).map((n) => n.id),
        ...normal.filter((n) => !pinnedIds.has(n.id)).map((n) => n.id),
      ]);
      expect(notes).toEqual(before);
      expect(filterNotes(notes, { q: notes[0].title })).toEqual([notes[0]]);
    },
  );

  it("persists pin and unpin without changing edit dates, history or normal order", async () => {
    const storage = memory();
    const r = createRepositories(storage);
    const note = await r.notes.create({ title: "Test Note A", updatedAt: "2020-01-01T00:00:00.000Z" });
    const originalOrder = (await r.notes.list()).map((n) => n.id);
    const versions = await r.notes.versions(note.id);
    expect(note.pinned).toBe(false);
    await r.notes.setPinned(note.id, true);
    const reopened = createRepositories(storage);
    expect(await reopened.notes.get(note.id)).toEqual({ ...note, pinned: true });
    await reopened.notes.setPinned(note.id, false);
    const next = createRepositories(storage);
    expect(await next.notes.get(note.id)).toEqual(note);
    expect((await next.notes.list()).map((n) => n.id)).toEqual(originalOrder);
    expect(await next.notes.versions(note.id)).toEqual(versions);
  });

  it("preserves pinning through edits and history restoration", async () => {
    const r = createRepositories();
    const n = await r.notes.create({ title: "Original", body: "first" });
    const pinned = await r.notes.setPinned(n.id, true);
    await r.notes.save({ ...pinned, body: "second" });
    const [version] = await r.notes.versions(n.id);
    expect((await r.notes.restore(n.id, version.id)).pinned).toBe(true);
    expect((await r.notes.get(n.id)).body).toBe("first");
  });

  it("treats older notes without a pinned field as unpinned", () => {
    const notes = seedNotes().map((n) => ({ ...n, pinned: false }));
    Reflect.deleteProperty(notes[0], "pinned");
    notes[2].pinned = true;
    expect(filterNotes(notes)[0].id).toBe(notes[2].id);
    expect(filterNotes(notes)[1].id).toBe(notes[0].id);
  });

  it("rolls back a failed pin write and rejects unknown notes", async () => {
    const data = memory();
    let fail = false;
    const r = createRepositories({
      getItem: data.getItem,
      setItem: (key, value) => {
        if (fail) throw Error("quota");
        data.setItem(key, value);
      },
    });
    const n = await r.notes.create({ title: "Test Note A" });
    fail = true;
    await expect(r.notes.setPinned(n.id, true)).rejects.toThrow("storage");
    expect(await r.notes.get(n.id)).toEqual(n);
    expect(await createRepositories(data).notes.get(n.id)).toEqual(n);
    await expect(r.notes.setPinned("missing", true)).rejects.toThrow("found");
  });
});

describe("note deletion (task #115)", () => {
  const student = { id: "student-a", name: "Student A", email: "a@example.edu" };
  const titles = async (r: Repositories) =>
    (await r.notes.list()).map((n) => n.title).sort();

  it("Test 1 - a deleted note is no longer listed or returned by ID", async () => {
    const r = createRepositories(memory(), student, false);
    const biology = await r.notes.create({ title: "Biology lab draft" });
    await r.notes.create({ title: "Calculus review" });
    await r.notes.create({ title: "Meeting agenda" });
    await expect(r.notes.delete(biology.id)).resolves.toBeUndefined();
    expect(await titles(r)).toEqual(["Calculus review", "Meeting agenda"]);
    await expect(r.notes.get(biology.id)).rejects.toThrow("This note could not be found.");
  });

  it("Test 2 - removes the note's comments, versions, and collaborators and nothing else", async () => {
    const storage = memory();
    const stored = () => JSON.parse(storage.getItem("notely-data-v1")!);
    const r = createRepositories(storage, student, false);
    const shared = await r.notes.create({ title: "Group project plan", visibility: "shared" });
    for (const body of ["Draft one", "Draft two", "Draft three"])
      await r.notes.save({ ...(await r.notes.get(shared.id)), body });
    await r.notes.comment(shared.id, "Looks good.");
    await r.notes.comment(shared.id, "Added the timeline.");
    await r.notes.inviteCollaborator(shared.id, "jamie@example.edu");
    const other = await r.notes.create({ title: "Calculus review", visibility: "shared" });
    await r.notes.save({ ...other, body: "Limits" });
    await r.notes.comment(other.id, "Keep this one.");
    const before = stored();
    expect(before.comments.filter((c: { noteId: string }) => c.noteId === shared.id)).toHaveLength(2);
    expect(await r.notes.versions(shared.id)).toHaveLength(3);
    expect(await r.notes.collaborators(shared.id)).toHaveLength(1);

    await r.notes.delete(shared.id);

    const after = stored();
    expect(JSON.stringify(after)).not.toContain(shared.id);
    expect(await r.notes.collaborators(shared.id)).toEqual([]);
    expect(after.comments).toEqual(before.comments.filter((c: { noteId: string }) => c.noteId === other.id));
    expect(after.versions).toEqual(before.versions.filter((v: { noteId: string }) => v.noteId === other.id));
    expect(after.comments).toHaveLength(1);
    expect(after.versions).toHaveLength(1);
  });

  it("Test 3 - deleting a missing note rejects and leaves other notes alone", async () => {
    const r = createRepositories(memory(), student, false);
    await r.notes.create({ title: "Biology lab draft" });
    await r.notes.create({ title: "Calculus review" });
    await expect(r.notes.delete("missing-note")).rejects.toThrow("This note could not be found.");
    expect(await titles(r)).toEqual(["Biology lab draft", "Calculus review"]);
  });

  it("Test 4 - a failed storage write keeps the note, its comment, and its version", async () => {
    const data = memory();
    let failNext = false;
    const r = createRepositories({
      getItem: data.getItem,
      setItem: (key, value) => {
        if (failNext) {
          failNext = false;
          throw Error("quota");
        }
        data.setItem(key, value);
      },
    }, student, false);
    const note = await r.notes.create({ title: "Calculus review", visibility: "shared" });
    await r.notes.save({ ...note, body: "Limits" });
    await r.notes.comment(note.id, "Great summary.");
    failNext = true;
    await expect(r.notes.delete(note.id)).rejects.toThrow(
      "Your browser storage is full or unavailable. Changes could not be saved.",
    );
    expect(await titles(r)).toEqual(["Calculus review"]);
    expect(await r.notes.comments(note.id)).toHaveLength(1);
    expect(await r.notes.versions(note.id)).toHaveLength(1);
    const reloaded = createRepositories(data, student, false);
    expect(await titles(reloaded)).toEqual(["Calculus review"]);
    expect(await reloaded.notes.comments(note.id)).toHaveLength(1);
  });
});

describe("owner-only note deletion (task #116)", () => {
  const studentA = { id: "student-a", name: "Student A", email: "a@example.edu" };
  // The collaborator mock only knows Jamie, so Jamie plays Student B. Its
  // invitations are kept in memory per repository instance, so each signed-in
  // instance records the share itself, as in the edit-permission tests above.
  const studentB = { id: "classmate-jamie", name: "Jamie", email: "jamie@example.edu" };

  it("Test 1 - the owner can delete their own note", async () => {
    const r = createRepositories(memory(), studentA, false);
    const note = await r.notes.create({ title: "Owner's note" });
    await expect(r.notes.delete(note.id)).resolves.toBeUndefined();
    expect((await r.notes.list()).map((n) => n.title)).not.toContain("Owner's note");
  });

  it("Test 2 - edit and view collaborators cannot delete a note they do not own", async () => {
    const storage = memory();
    const a = createRepositories(storage, studentA, false);
    const note = await a.notes.create({ title: "Group project plan", body: "Milestones", visibility: "shared" });
    await a.notes.comment(note.id, "Please review the timeline.");
    await a.notes.inviteCollaborator(note.id, studentB.email);
    await a.notes.setCollaboratorPermission(note.id, studentB.id, "edit");
    const collaborators = await a.notes.collaborators(note.id);

    const b = createRepositories(storage, studentB, false);
    await b.notes.inviteCollaborator(note.id, studentB.email);
    for (const permission of ["edit", "view"] as const) {
      await b.notes.setCollaboratorPermission(note.id, studentB.id, permission);
      await expect(b.notes.delete(note.id)).rejects.toThrow("Only the note's owner can delete it.");
    }

    const reloaded = createRepositories(storage, studentA, false);
    expect(await reloaded.notes.get(note.id)).toEqual(note);
    expect((await reloaded.notes.comments(note.id)).map((c) => c.body)).toEqual(["Please review the timeline."]);
    expect(await a.notes.collaborators(note.id)).toEqual(collaborators);
  });

  it("Test 3 - signed-out and forged requests cannot delete a note", async () => {
    const storage = memory();
    const a = createRepositories(storage, studentA, false);
    const note = await a.notes.create({ title: "Calculus review" });

    const signedOut = createRepositories(storage, null, false);
    await expect(signedOut.notes.delete(note.id)).rejects.toThrow("Sign in to continue.");

    // delete(id) has no owner parameter; this cast smuggles one in anyway.
    const b = createRepositories(storage, studentB, false);
    const forged = b.notes.delete as unknown as (id: string, request: { ownerId: string }) => Promise<void>;
    await expect(forged(note.id, { ownerId: studentA.id })).rejects.toThrow("Only the note's owner can delete it.");

    const reloaded = createRepositories(storage, studentA, false);
    expect((await reloaded.notes.list()).map((n) => n.title)).toEqual(["Calculus review"]);
  });
});
