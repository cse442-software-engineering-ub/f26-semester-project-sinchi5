import { describe, expect, it, vi } from "vitest";
import type { AuthRepository, Course, CourseEvent, User } from "../../../../src/domain";
import { createAppRepositories } from "../../../../src/services/app-repositories";
import { NoteServiceError } from "../../../../src/services/notes-http";
import { fakeApi } from "./server-testkit";
function memory(): Storage {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); }, clear: () => data.clear(), key: index => [...data.keys()][index], get length() { return data.size; } };
}
// Stands in for the PHP API: one store of notes, courses and events per account.
function fakeServer() {
  const stores = new Map<string, ReturnType<typeof fakeApi>>();
  const api = (user: User) => {
    if (!stores.has(user.id)) stores.set(user.id, fakeApi({ courses: [], ownerId: user.id }));
    return stores.get(user.id)!;
  };
  let current: User | null = null;
  return {
    stores, api,
    // createAppRepositories asks for notes with the user, then for syllabus and courses for that same user.
    notes: (user: User) => { current = user; return api(user).notes; },
    syllabus: () => api(current!).syllabus,
    courses: () => api(current!).courses,
  };
}
const app = (auth: Partial<AuthRepository>, server = fakeServer(), storage = memory()) =>
  ({ server, storage, repo: createAppRepositories(auth as AuthRepository, server.notes, server.syllabus, server.courses, storage) });
const alice = { id: "1", name: "Alice", email: "alice@example.edu", hasPhoto: false };
const bob = { id: "2", name: "Bob", email: "bob@example.edu", hasPhoto: false };
const course = { code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };

it("forwards account photo actions", async () => {
  const uploadProfilePhoto = vi.fn().mockResolvedValue({ ...alice, hasPhoto: true });
  const removeProfilePhoto = vi.fn().mockResolvedValue({ ...alice, hasPhoto: false });
  const { repo } = app({ session: async () => ({ ...alice }), uploadProfilePhoto, removeProfilePhoto });
  await repo.auth.session();
  expect((await repo.auth.uploadProfilePhoto("raw-base64")).hasPhoto).toBe(true);
  expect(uploadProfilePhoto).toHaveBeenCalledWith("raw-base64");
  expect((await repo.auth.removeProfilePhoto()).hasPhoto).toBe(false);
});
it("needs a signed-in account for every workspace call, and ignores the old browser-only identity", async () => {
  const storage = memory();
  storage.setItem("notely-data-v1", JSON.stringify({ user: alice, completed: true, notes: [], courses: [] }));
  const { repo } = app({ session: vi.fn().mockResolvedValue(null) }, fakeServer(), storage);
  expect(await repo.auth.session()).toBeNull();
  await expect(repo.notes.list()).rejects.toThrow("Log in to continue.");
  await expect(repo.courses.list()).rejects.toThrow("Log in to continue.");
  await expect(repo.schedule.list()).rejects.toThrow("Log in to continue.");
});
it("isolates accounts and keeps courses, events and notes on the server, never in browser storage", async () => {
  let current: User | null = alice;
  const { repo, storage, server } = app({ session: async () => current, deleteAccount: async () => { current = null; } });
  await repo.auth.session();
  const note = await repo.notes.create({ title: "Alice only" });
  expect(note.ownerId).toBe("1");
  const saved = await repo.courses.create(course);
  await repo.schedule.save({ id: "", courseId: saved.id, title: "Study group", kind: "other", date: "2026-11-20", time: "", location: "", description: "", source: "manual" });
  expect(storage.length).toBe(0);
  expect(server.stores.get("1")!.calls.map((c) => c.route)).toEqual(expect.arrayContaining(["course-save", "event-save"]));
  current = bob; await repo.auth.session();
  expect(await repo.notes.list()).toEqual([]);
  expect(await repo.courses.list()).toEqual([]);
  current = alice; await repo.auth.session();
  expect((await repo.notes.get(note.id)).title).toBe("Alice only");
  expect((await repo.courses.list()).map((c) => c.code)).toEqual(["CSE 442"]);
  await repo.auth.deleteAccount("current password");
  await expect(repo.notes.list()).rejects.toThrow("Log in to continue.");
});
it("clears selected workspace on server failure", async () => {
  const session = vi.fn().mockResolvedValueOnce(alice).mockRejectedValueOnce(new Error("unavailable"));
  const { repo } = app({ session });
  await repo.auth.session();
  await expect(repo.auth.session()).rejects.toThrow("unavailable");
  await expect(repo.notes.list()).rejects.toThrow("Log in to continue.");
});
it("ignores an older server refresh after signing out", async () => {
  let finish!: (user: User | null) => void;
  const session = () => new Promise<User | null>(resolve => { finish = resolve; });
  const { repo } = app({ session, signOut: async () => undefined });
  const earlier = repo.auth.session();
  await repo.auth.signOut();
  finish(alice);
  expect(await earlier).toBeNull();
  await expect(repo.notes.list()).rejects.toThrow("Log in to continue.");
});
it("Clear workspace sends one workspace-clear request and the server empties notes, courses and events (card 218)", async () => {
  const { repo, server } = app({ session: async () => alice });
  await repo.auth.session();
  const api = server.stores.get("1")!;
  const saved = await repo.courses.create(course);
  await repo.notes.create({ title: "Lecture 1", courseId: saved.id });
  await repo.schedule.save({ id: "", courseId: saved.id, title: "Quiz", kind: "quiz", date: "2026-11-20", time: "", location: "", description: "", source: "manual" });
  await repo.schedule.save({ id: "", courseId: "gone", title: "Orphan", kind: "other", date: "2026-11-21", time: "", location: "", description: "", source: "manual" });
  await repo.reset();
  expect([await repo.notes.list(), await repo.courses.list(), await repo.schedule.list()]).toEqual([[], [], []]);
  expect(api.calls.filter((c) => /clear|delete/.test(c.route))).toEqual([{ route: "workspace-clear", body: { confirm: "CLEAR" } }]);
});
it("keeps notes with the server and lists a course's lecture folders from them (task #120)", async () => {
  const { repo, storage } = app({ session: async () => alice });
  await repo.auth.session();
  const saved = await repo.courses.create(course);
  const note = await repo.notes.create({ title: "Server note", courseId: saved.id });
  expect(storage.length).toBe(0);
  expect(Object.values(await repo.courses.folders(saved.id)).flat().map((n) => n.title)).toEqual(["Server note"]);
  expect((await repo.schedule.lectureNotes({ id: "", courseId: saved.id, title: "Lecture", kind: "lecture", date: note.lectureDate,
    time: "10:00", location: "", description: "", source: "manual" })).map((n) => n.title)).toEqual(["Server note"]);
});

// shortcut: one-time adoption of pre-Nov-2026 browser data, delete after Sprint 4
describe("adopting the old browser workspace (card 142)", () => {
  const key = "notely-workspace-v1-1";
  const oldCourses: Course[] = [
    { id: "6f1c2a9e-0000-4000-8000-000000000001", ...course, classesStart: "2026-08-31", classesEnd: "2026-12-11" },
    { id: "6f1c2a9e-0000-4000-8000-000000000002", code: "CSE 331", name: "Algorithms", color: "#91785D", term: "Fall 2026" },
  ];
  const handMade: CourseEvent = { id: "9b2d7c1e-0000-4000-8000-000000000003", courseId: oldCourses[0].id, title: "Study group", kind: "other",
    date: "2026-11-20", time: "14:30", location: "Capen 1", description: "Bring notes", source: "manual", repeat: { every: 1, days: [4], until: "2026-12-10" } };
  const editedImport: CourseEvent = { id: "41", courseId: oldCourses[0].id, title: "Midterm (room 101)", kind: "exam", date: "2026-10-14",
    time: "10:00", location: "Knox 101", description: "", source: "imported", seriesId: null };
  const seeded = () => {
    const storage = memory();
    storage.setItem(key, JSON.stringify({ courses: oldCourses, notes: [], events: [handMade, editedImport], comments: [], versions: [] }));
    const server = fakeServer();
    // The server already has the imported event the student edited in this browser.
    server.api(alice).store.events.push({ ...editedImport, title: "Midterm", location: "" });
    return { storage, server };
  };
  const sent = (server: ReturnType<typeof fakeServer>) => server.stores.get("1")!.calls.filter((c) => /-save$/.test(c.route));

  it("sends each old course with its id, each hand-made event without an id and each edited event with its id, then removes the key", async () => {
    const { storage, server } = seeded();
    const { repo } = app({ session: async () => alice }, server, storage);
    await repo.auth.session();
    expect(sent(server)).toEqual([
      { route: "course-save", body: oldCourses[0] },
      { route: "course-save", body: oldCourses[1] },
      { route: "event-save", body: Object.fromEntries(Object.entries(handMade).filter(([k]) => k !== "id")) },
      { route: "event-save", body: editedImport },
    ]);
    expect(storage.getItem(key)).toBeNull();
    expect((await repo.courses.list()).map((c) => c.id)).toEqual(oldCourses.map((c) => c.id));
    expect((await repo.schedule.list()).map((e) => [e.title, e.source])).toEqual([["Midterm (room 101)", "imported"], ["Study group", "manual"]]);
    // Later refreshes in the same page load send nothing more.
    await repo.auth.session();
    expect(sent(server)).toHaveLength(4);
  });

  it("keeps the key when a request fails, and a retry on the next load sends only what is left, with no duplicates", async () => {
    const { storage, server } = seeded();
    const api = server.api(alice);
    api.failWhen = (route, body) => route === "event-save" && (body as CourseEvent).title === "Midterm (room 101)" ? new NoteServiceError("Notely is unavailable.", 503) : undefined;
    await app({ session: async () => alice }, server, storage).repo.auth.session();
    expect(sent(server).map((c) => c.route)).toEqual(["course-save", "course-save", "event-save", "event-save"]);
    const left = JSON.parse(storage.getItem(key)!);
    expect([left.courses, left.events.map((e: CourseEvent) => e.id)]).toEqual([[], ["41"]]);
    // Next page load: the server is back.
    api.failWhen = () => undefined;
    api.calls.length = 0;
    const { repo } = app({ session: async () => alice }, server, storage);
    await repo.auth.session();
    expect(sent(server)).toEqual([{ route: "event-save", body: editedImport }]);
    expect(storage.getItem(key)).toBeNull();
    expect((await repo.schedule.list()).filter((e) => e.title === "Study group")).toHaveLength(1);
  });

  it("saves an edited event whose server copy is gone as a new event, and keeps a copy that still holds old notes", async () => {
    const storage = memory();
    storage.setItem(key, JSON.stringify({ courses: [], events: [editedImport], notes: [{ id: "n1", title: "Pre-#120 note" }] }));
    const { repo, server } = app({ session: async () => alice }, fakeServer(), storage);
    await repo.auth.session();
    expect(sent(server).map((c) => (c.body as CourseEvent).id ?? "none")).toEqual(["41", "none"]);
    expect(JSON.parse(storage.getItem(key)!)).toMatchObject({ courses: [], events: [], notes: [{ title: "Pre-#120 note" }] });
  });

  it("leaves a damaged copy alone and still signs the student in", async () => {
    const storage = memory();
    storage.setItem(key, "{not json");
    const { repo, server } = app({ session: async () => alice }, fakeServer(), storage);
    expect(await repo.auth.session()).toEqual(alice);
    expect(sent(server)).toEqual([]);
    expect(storage.getItem(key)).toBe("{not json");
  });
});
