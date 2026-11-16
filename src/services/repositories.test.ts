import { describe, expect, it } from "vitest";
import { createRepositories, filterNotes } from "./repositories";
import { seedNotes, dateKey } from "./fixtures";
import { fakeApi } from "./server-testkit";
import type { Repositories } from "../domain";
// Card 142: the repositories run over the server's routes; fakeApi() stands in for them with the sample courses.
const repos = (syllabus?: object) => createRepositories(fakeApi({ syllabus }));

describe("repository contracts", () => {
  it("matches one complete tag and combines it with search, course, and sorting", async () => {
    const [first, second, third] = seedNotes();
    const notes = [
      { ...first, title: "Exam outline", body: "", tags: ["exam"], courseId: "cse442", pinned: false },
      { ...second, title: "Final exam guide", body: "", tags: ["final exam"], courseId: "cse442", pinned: false },
      { ...third, title: "Project plan", body: "", tags: ["project"], courseId: "cse442", pinned: false },
      { ...first, id: "other-exam", title: "Exam 331 review", body: "", tags: ["exam"], courseId: "cse331", pinned: false },
    ];
    expect(filterNotes(notes, { tag: "exam" }).map((n) => n.title).sort()).toEqual(["Exam 331 review", "Exam outline"]);
    expect(filterNotes(notes, { tag: "final exam" }).map((n) => n.title)).toEqual(["Final exam guide"]);
    expect(filterNotes(notes, { tag: "exam", course: "cse442" }).map((n) => n.title)).toEqual(["Exam outline"]);
    expect(filterNotes(notes, { tag: "exam", course: "cse442", q: "plan" })).toEqual([]);
    expect(filterNotes(notes, { tag: "exam", sort: "title" }).map((n) => n.title)).toEqual(["Exam 331 review", "Exam outline"]);

    const repo = repos();
    await repo.notes.create({ title: "Half done", tags: ["50%_done"] });
    await repo.notes.create({ title: "Fifty X", tags: ["50Xdone"] });
    expect((await repo.notes.list({ tag: "50%_done" })).map((n) => n.title)).toEqual(["Half done"]);
  });
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
  it("validates uploads, supports partial/failure states and confirms imports", async () => {
    const r = repos();
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
    const r = repos(server);
    const file = new File(["CSE 442 Syllabus"], "cse442-syllabus.txt");
    const queued = await r.imports.start(file, "syllabus", "success", "cse442");
    expect([queued.id, queued.state, queued.metadata.courseId]).toEqual(["7", "queued", "cse442"]);
    const job = await r.imports.process(queued);
    // The CSE 442 sample course is in Fall 2026, and even a text file goes to the reader.
    expect(calls).toEqual(["upload cse442-syllabus.txt cse442", "extract 7 2026"]);
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
    const r = repos(server);
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
    const r = repos(server);
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
      confirm: async (...args: unknown[]) => { confirmed.push(args); return { created: 1, skipped: 0 }; },
    };
    const api = fakeApi({ syllabus: server, events: [midterm] });
    const r = createRepositories(api);
    const file = new File(["syllabus"], "cse442-syllabus.txt");
    const job = await r.imports.process(await r.imports.start(file, "syllabus", "success", "cse442"));
    job.events[1].include = false;
    expect(await r.imports.confirm(job)).toEqual({ created: 1, skipped: 0, first: "2026-09-28" });
    expect(confirmed).toEqual([["9", "cse442", [{ title: "Homework 1", kind: "assignment", date: "2026-09-28", time: "", location: "" }]]]);
    expect(await r.schedule.list("2026-10-01", "2026-10-31")).toEqual([midterm]);
    // Card 142: editing an imported event saves it over the server's copy (same id), with no browser copy.
    await r.schedule.save({ ...midterm, title: "Midterm exam (room 101)" });
    expect(api.calls.filter((c) => c.route === "event-save")).toEqual([{ route: "event-save", body: { ...midterm, title: "Midterm exam (room 101)" } }]);
    expect((await r.schedule.list()).map((e) => [e.id, e.title, e.source])).toEqual([["41", "Midterm exam (room 101)", "imported"]]);
  });
  it("creates a hand-made event without an id and edits it with its id, repeat and description included (card 142)", async () => {
    const api = fakeApi();
    const r = createRepositories(api);
    const event = { id: "", courseId: "cse442", title: "Study group", kind: "other" as const, date: "2026-11-20", time: "14:30",
      location: "Capen 1", description: "Bring notes", source: "manual" as const, repeat: { every: 2 as const, days: [1, 3], until: "2026-12-20" } };
    const saved = await r.schedule.save(event);
    expect(api.calls.at(-1)).toEqual({ route: "event-save", body: { ...event, id: undefined } });
    expect(api.calls.at(-1)!.body).not.toHaveProperty("id");
    await r.schedule.save({ ...saved, title: "Study group (moved)" });
    expect(api.calls.at(-1)!.body).toMatchObject({ id: saved.id, title: "Study group (moved)", description: "Bring notes", repeat: event.repeat });
    expect((await r.schedule.list()).map((e) => e.title)).toEqual(["Study group (moved)"]);
    await r.schedule.remove(saved);
    expect(await r.schedule.list()).toEqual([]);
  });
  it("saves each included weekly class as one event per meeting, tied together by a series (card 46)", async () => {
    const confirmed: unknown[][] = [];
    const lecture = { title: "Lecture", kind: "lecture", section: "", days: [1, 3], time: "10:00", location: "Davis 101", firstDate: "2026-08-24", lastDate: "2026-09-02", source: "" };
    const server = {
      upload: async () => ({ id: "11" }),
      extract: async () => ({ isSyllabus: true, noClassDates: [{ from: "2026-08-26", to: "2026-08-26" }], events: [],
        meetings: [lecture, { ...lecture, title: "Lab", kind: "lab", section: "A1", days: [2] }, { ...lecture, title: "Lab", kind: "lab", section: "A2", days: [4] }] }),
      confirm: async (...args: unknown[]) => { confirmed.push(args); return { created: 1, skipped: 0 }; },
    } as never;
    const r = repos(server);
    const course = await r.courses.create({ code: "CSE 442", name: "Software Engineering", color: "#000000", term: "Fall 2026" });
    const job = await r.imports.process(await r.imports.start(new File(["syllabus"], "s.txt"), "syllabus", "success", course.id));
    // The student picks lab A2 and leaves A1 out. Series numbers count only what's included.
    job.meetings![2].include = true;
    // The earliest date added is a class's, so the schedule opens there.
    expect((await r.imports.confirm(job)).first).toBe("2026-08-24");
    const rows = confirmed[0][2] as { title: string; kind: string; date: string; time: string; location: string; series: number }[];
    expect(rows.map((row) => [row.title, row.kind, row.date, row.time, row.location, row.series])).toEqual([
      ["CSE 442 Lecture", "lecture", "2026-08-24", "10:00", "Davis 101", 0],
      ["CSE 442 Lecture", "lecture", "2026-08-31", "10:00", "Davis 101", 0],
      ["CSE 442 Lecture", "lecture", "2026-09-02", "10:00", "Davis 101", 0],
      ["CSE 442 Lab A2", "lab", "2026-08-27", "10:00", "Davis 101", 1],
    ]);
  });
  it("passes on the reader's reason when it can't read a file (card 45)", async () => {
    const server = {
      upload: async () => ({ id: "10" }),
      extract: async () => { throw new Error("You can read 10 syllabi automatically each day. Try again tomorrow."); },
    } as never;
    const r = repos(server);
    const file = new File(["syllabus"], "syllabus.txt");
    const queued = await r.imports.start(file, "syllabus", "success", "cse442");
    await expect(r.imports.process(queued)).rejects.toThrow("You can read 10 syllabi automatically each day. Try again tomorrow.");
  });
  it("names what a renamed or damaged file really is, before uploading (card 45)", async () => {
    let uploads = 0;
    const server = { upload: async () => ({ id: String(++uploads) }) } as never;
    const r = repos(server);
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
    const r = repos();
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
    await r.notes.create({ title: "Today's lecture", courseId: "cse442", lectureDate: dateKey() });
    const saved = await r.schedule.save(event);
    expect(saved.id).toBeTruthy();
    expect(await r.schedule.lectureNotes(saved)).toHaveLength(1);
    expect((await r.courses.folders("cse442"))[dateKey()]).toHaveLength(1);
  });
  // Card 35: a document upload is registered, then read, as the import dialog does.
  const upload = async (r: ReturnType<typeof createRepositories>, file: File) =>
    r.imports.process(await r.imports.start(file, "document"));
  const fake = (name: string, text?: () => Promise<string>) => ({ name, size: 10, text }) as unknown as File;
  it("extracts and persists uploaded content, course and lecture date across reloads", async () => {
    const api = fakeApi();
    const r = createRepositories(api);
    const text = "Course: CSE 442\nLecture date: September 14, 2026\nSprint planning notes.";
    const job = await upload(r, new File([text], "Sprint planning.txt"));
    expect(job.state).toBe("review");
    expect((await r.courses.list()).find((c) => c.id === job.metadata.courseId)?.code).toBe("CSE 442");
    expect(job.metadata.lectureDate).toBe("2026-09-14");
    await r.imports.confirm(job);
    const reloaded = createRepositories(api);
    const [note] = await reloaded.notes.list({ q: "Sprint planning" });
    expect(note).toMatchObject({ body: text, courseId: "cse442", lectureDate: "2026-09-14" });
    expect((await reloaded.courses.folders("cse442"))["2026-09-14"].some((n) => n.id === note.id)).toBe(true);
  });
  it("saves missing fields as empty and excludes undated notes from date filters", async () => {
    const r = repos();
    const job = await upload(r, new File(["No metadata here."], "Unidentified.txt"));
    expect(job.state).toBe("partial");
    expect(job.metadata).toMatchObject({ courseId: "", lectureDate: "" });
    await r.imports.confirm(job);
    const [note] = await r.notes.list({ q: "Unidentified" });
    expect(note).toMatchObject({ courseId: "", lectureDate: "" });
    expect(await r.notes.list({ q: "Unidentified", to: "2026-09-14" })).toEqual([]);
    expect(await r.notes.list({ q: "Unidentified", from: "2026-09-14" })).toEqual([]);
  });
  it("keeps independent fields and respects corrections at review", async () => {
    const r = repos();
    const job = await upload(r, new File(["CSE 442"], "Course only.md"));
    expect(job.metadata).toMatchObject({ courseId: "cse442", lectureDate: "" });
    job.metadata.lectureDate = "2026-09-15";
    job.metadata.courseId = "cse331";
    await r.imports.confirm(job);
    expect((await r.notes.list({ q: "Course only" }))[0]).toMatchObject({ courseId: "cse331", lectureDate: "2026-09-15" });
    const dated = await upload(r, new File(["Date: 2026-09-14"], "Date only.txt"));
    expect(dated.metadata).toMatchObject({ courseId: "", lectureDate: "2026-09-14" });
  });
  it("uses filenames for binary uploads and never reads them as plain text", async () => {
    const r = repos();
    for (const extension of ["pdf", "docx", "png"]) {
      const job = await upload(r, fake(`CSE442_2026-09-14.${extension}`, async () => { throw Error("Do not read binary text"); }));
      expect(job.metadata).toMatchObject({ courseId: "cse442", lectureDate: "2026-09-14" });
    }
    const unknown = await upload(r, fake("lecture.pdf"));
    expect(unknown.metadata).toMatchObject({ courseId: "", lectureDate: "" });
  });
  it("reports text read failures without creating a note", async () => {
    const r = repos();
    await expect(upload(r, fake("lecture.txt", async () => { throw Error("read failed"); }))).rejects.toThrow("could not be read");
    expect(await r.notes.list()).toHaveLength(0);
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

  it("treats older notes without a pinned field as unpinned", () => {
    const notes = seedNotes().map((n) => ({ ...n, pinned: false }));
    Reflect.deleteProperty(notes[0], "pinned");
    notes[2].pinned = true;
    expect(filterNotes(notes)[0].id).toBe(notes[2].id);
    expect(filterNotes(notes)[1].id).toBe(notes[0].id);
  });
});
