import type {
  Repositories,
  Note,
  NoteVersion,
  Comment,
  CourseEvent,
  UploadJob,
  User,
  Course,
  NoteQuery,
} from "../domain";
import {
  courses,
  seedNotes,
  seedEvents,
  dateKey,
  offsetDate,
} from "./fixtures";
interface Store {
  user: User | null;
  completed: boolean;
  courses: Course[];
  notes: Note[];
  events: CourseEvent[];
  comments: Comment[];
  versions: NoteVersion[];
}
const initial = (): Store => ({
  user: null,
  completed: false,
  courses: [...courses],
  notes: seedNotes(),
  events: seedEvents(),
  comments: [
    {
      id: "comment-1",
      noteId: "note-1",
      author: "Alex Morgan",
      body: "The distinction between a sprint review and retrospective finally clicked. Thanks for sharing!",
      createdAt: new Date().toISOString(),
    },
  ],
  versions: seedNotes().map((n) => ({
    id: `version-${n.id}`,
    noteId: n.id,
    title: n.title,
    body: n.body.split("\n\n")[0],
    author: "You",
    createdAt: n.createdAt,
  })),
});
export function filterNotes(
  notes: Note[],
  query: NoteQuery = {},
  allCourses: Course[] = courses,
) {
  const q = (query.q || "").toLowerCase();
  return notes
    .filter(
      (n) =>
        (!q ||
          [
            n.title,
            n.body,
            n.category,
            ...n.tags,
            allCourses.find((c) => c.id === n.courseId)?.name,
            allCourses.find((c) => c.id === n.courseId)?.code,
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)) &&
        (!query.course || n.courseId === query.course) &&
        (!query.category || n.category === query.category) &&
        (!query.visibility || n.visibility === query.visibility) &&
        (!query.from || n.lectureDate >= query.from) &&
        (!query.to || n.lectureDate <= query.to),
    )
    .sort((a, b) =>
      query.sort === "title"
        ? a.title.localeCompare(b.title)
        : query.sort === "created"
          ? b.createdAt.localeCompare(a.createdAt)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
}
export function createRepositories(
  storage?: Pick<Storage, "getItem" | "setItem">,
): Repositories {
  let db = initial();
  try {
    const saved = storage?.getItem("notely-data-v1");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.notes) && Array.isArray(parsed.courses))
        db = parsed;
    }
  } catch {
    /* Recover from unavailable or corrupted storage. */
  }
  let committed = structuredClone(db);
  const persist = () => {
    try {
      storage?.setItem("notely-data-v1", JSON.stringify(db));
      committed = structuredClone(db);
    } catch {
      db = structuredClone(committed);
      throw new Error(
        "Your browser storage is full or unavailable. Changes could not be saved.",
      );
    }
  };
  const id = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const get = (noteId: string) => {
    const n = db.notes.find((n) => n.id === noteId);
    if (!n) throw new Error("This note could not be found.");
    return n;
  };
  const repo: Repositories = {
    auth: {
      async session() {
        return db.user;
      },
      async signIn(email, name) {
        db.user = { id: "student", email, name: name || email.split("@")[0] };
        persist();
        return db.user;
      },
      async signOut() {
        db.user = null;
        persist();
      },
      async onboarding() {
        return { completed: db.completed, step: db.completed ? 3 : 0 };
      },
      async completeOnboarding() {
        db.completed = true;
        persist();
      },
    },
    courses: {
      async list() {
        return [...db.courses];
      },
      async create(data) {
        const c = { ...data, id: id() };
        db.courses.push(c);
        persist();
        return c;
      },
      async folders(courseId) {
        return db.notes
          .filter((n) => n.courseId === courseId)
          .reduce<Record<string, Note[]>>((out, n) => {
            (out[n.lectureDate] ??= []).push(n);
            return out;
          }, {});
      },
    },
    notes: {
      async list(q) {
        return filterNotes(db.notes, q, db.courses);
      },
      async get(noteId) {
        return { ...get(noteId) };
      },
      async create(data) {
        const n: Note = {
          id: id(),
          title: "Untitled note",
          body: "",
          courseId: "",
          lectureDate: dateKey(),
          category: "School",
          visibility: "private",
          tags: [],
          pinned: false,
          createdAt: now(),
          updatedAt: now(),
          ...data,
        };
        db.notes.unshift(n);
        persist();
        return n;
      },
      async save(note) {
        const previous = get(note.id);
        if (previous.title !== note.title || previous.body !== note.body)
          db.versions.unshift({
            id: id(),
            noteId: note.id,
            title: previous.title,
            body: previous.body,
            author: db.user?.name || "You",
            createdAt: previous.updatedAt,
          });
        const saved = { ...note, updatedAt: now() };
        db.notes = db.notes.map((n) => (n.id === note.id ? saved : n));
        persist();
        return saved;
      },
      async comments(noteId) {
        return db.comments.filter((c) => c.noteId === noteId);
      },
      async comment(noteId, body) {
        if (get(noteId).visibility !== "shared")
          throw new Error("Share this note before adding comments.");
        if (!body.trim()) throw new Error("Write a comment first.");
        const c = {
          id: id(),
          noteId,
          body: body.trim(),
          author: db.user?.name || "You",
          createdAt: now(),
        };
        db.comments.push(c);
        persist();
        return c;
      },
      async versions(noteId) {
        return db.versions.filter((v) => v.noteId === noteId);
      },
      async restore(noteId, versionId) {
        const v = db.versions.find(
          (v) => v.id === versionId && v.noteId === noteId,
        );
        if (!v) throw new Error("Version not found.");
        return repo.notes.save({
          ...get(noteId),
          title: v.title,
          body: v.body,
        });
      },
    },
    schedule: {
      async list(from, to) {
        return db.events
          .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
          .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      },
      async save(event) {
        const e = { ...event, id: event.id || id() };
        db.events = [...db.events.filter((x) => x.id !== e.id), e];
        persist();
        return e;
      },
      async lectureNotes(event) {
        return db.notes.filter(
          (n) => n.courseId === event.courseId && n.lectureDate === event.date,
        );
      },
    },
    imports: {
      validate(file, kind) {
        const extension = file.name.split(".").pop()?.toLowerCase();
        const allowed =
          kind === "scan"
            ? ["jpg", "jpeg", "png", "webp"]
            : ["pdf", "docx", "txt", "md", "jpg", "jpeg", "png", "webp"];
        if (!extension || !allowed.includes(extension))
          return "Choose a PDF, DOCX, TXT, Markdown, or supported image file.";
        if (file.size > 20 * 1024 * 1024)
          return "Choose a file smaller than 20 MB.";
        if (!file.size) return "This file is empty. Please choose another.";
        return null;
      },
      async start(file, kind, scenario = "success") {
        const error = repo.imports.validate(file, kind);
        if (error) throw new Error(error);
        return {
          id: id(),
          kind,
          name: file.name,
          state:
            scenario === "failure"
              ? "failed"
              : scenario === "partial"
                ? "partial"
                : "review",
          metadata: {
            title: file.name.replace(/\.[^.]+$/, ""),
            courseId: db.courses[0]?.id || "",
            lectureDate: dateKey(),
            category: "School",
          },
          events:
            kind === "syllabus"
              ? [
                  {
                    id: "",
                    courseId: db.courses[0]?.id || "",
                    title: "Assignment 1",
                    date: offsetDate(7),
                    time: "23:59",
                    kind: "assignment",
                    location: "",
                    description:
                      "Detected from syllabus. Review before saving.",
                    source: "imported",
                  },
                  {
                    id: "",
                    courseId: db.courses[0]?.id || "",
                    title: "Midterm exam",
                    date: offsetDate(21),
                    time: "10:00",
                    kind: "exam",
                    location: "",
                    description: "Detected from syllabus.",
                    source: "imported",
                  },
                ]
              : [],
        };
      },
      async confirm(job) {
        if (job.state !== "review" && job.state !== "partial")
          throw new Error("This upload is not ready to save.");
        if (job.kind === "syllabus") {
          for (const e of job.events)
            await repo.schedule.save({ ...e, courseId: job.metadata.courseId });
        } else
          await repo.notes.create({
            ...job.metadata,
            body: `Imported from ${job.name}.\n\nYour document is ready to organize. Add your notes here.`,
          });
      },
    },
    async reset() {
      db = initial();
      persist();
    },
  };
  return repo;
}
