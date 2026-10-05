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
    expect(
      filterNotes(notes, { q: "Algorithms" }).map((n) => n.courseId),
    ).toEqual(["cse331"]);
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
