import type {
  Repositories,
  Note,
  UploadJob,
  NoteQuery,
  NoteRepository,
  DetectedEvent,
  DetectedMeeting,
} from "../domain";
import type { SyllabusApi } from "./imports-http";
import type { CoursesApi } from "./courses-http";
import { meetingDates, normalizeBreaks, normalizeEvents, normalizeMeetings } from "./syllabus";
import { fileTypeProblem } from "./syllabus-file";
import { dateKey } from "./fixtures";
import { detectNoteMetadata } from "./noteMetadata";
import { plainText } from "./noteText";
export function filterNotes(
  notes: Note[],
  query: NoteQuery = {},
) {
  const q = (query.q || "").toLowerCase();
  return notes
    .filter(
      (n) =>
        // Card 246: the server's notes list has no body; the server already searched it with the same q.
        (!q || n.body === undefined ||
          [n.title, plainText(n.body, n.format), ...n.tags]
            .join(" ")
            .toLowerCase()
            .includes(q)) &&
        (!query.tag || n.tags.includes(query.tag)) &&
        (!query.course || n.courseId === query.course) &&
        (!query.category || n.category === query.category) &&
        (!query.visibility || n.visibility === query.visibility) &&
        (!query.from || n.lectureDate >= query.from) &&
        (!query.to || (!!n.lectureDate && n.lectureDate <= query.to)),
    )
    .sort((a, b) =>
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      (query.sort === "title"
        ? a.title.localeCompare(b.title)
        : query.sort === "created"
          ? b.createdAt.localeCompare(a.createdAt)
          : b.updatedAt.localeCompare(a.updatedAt)),
    );
}
// Card 142: a signed-in student's courses, events and notes all live on the server; nothing is kept in the browser.
export function createRepositories(server: {
  notes: NoteRepository;
  syllabus: SyllabusApi;
  courses: CoursesApi;
}): Omit<Repositories, "auth" | "reset"> {
  const repo: Omit<Repositories, "auth" | "reset"> = {
    courses: {
      async list() {
        return server.courses.list();
      },
      async create(data) {
        return server.courses.save(data);
      },
      async folders(courseId) {
        return (await repo.notes.list({ course: courseId }))
          .reduce<Record<string, Note[]>>((out, n) => {
            (out[n.lectureDate] ??= []).push(n);
            return out;
          }, {});
      },
    },
    notes: server.notes,
    schedule: {
      async list(from, to) {
        // Hand-made and syllabus events together (cards 48 and 141).
        return (await server.syllabus.events())
          .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
          .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      },
      async save(event) {
        // A new event has no id; an edited one, hand-made or imported, is replaced on the server in place.
        return server.courses.saveEvent(event);
      },
      async remove(event, wholeSeries = false) {
        // Card 173: a failure keeps the event. One already gone from the server (404) needs nothing more.
        try {
          await server.syllabus.deleteEvent(event.id, wholeSeries && Boolean(event.seriesId));
        } catch (e) {
          if ((e as { status?: number }).status !== 404) throw e;
        }
      },
      async lectureNotes(event) {
        return repo.notes.list({ course: event.courseId, from: event.date, to: event.date });
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
      async start(file, kind, _scenario, courseId) {
        const error = repo.imports.validate(file, kind);
        if (error) throw new Error(error);
        courseId ??= (await repo.courses.list())[0]?.id || "";
        const job = { kind, name: file.name, state: "queued" as const, events: [], metadata: {
          title: file.name.replace(/\.[^.]+$/, ""), courseId, lectureDate: dateKey(), category: "School",
        } };
        // A renamed file is caught here with a message that says how to fix it; the server checks again.
        const problem = kind === "syllabus" ? await fileTypeProblem(file) : null;
        if (problem) throw new Error(problem);
        if (kind === "syllabus") return { ...job, id: (await server.syllabus.upload(file, courseId)).id };
        // Card 35: TXT/Markdown text becomes the note body, and is where its course and lecture date are read from.
        let body: string | undefined;
        if (/\.(txt|md)$/i.test(file.name)) {
          try {
            body = await file.text();
          } catch {
            throw new Error("This file could not be read. Please choose it again.");
          }
        }
        return { ...job, id: crypto.randomUUID(), ...(body === undefined ? {} : { body }) };
      },
      async process(job, scenario = "success") {
        // "Processing failed" in the prototype preview options shows the failure screen on purpose.
        if (scenario === "failure") return { ...job, state: "failed" };
        const courses = await repo.courses.list();
        let events: DetectedEvent[] = [];
        let read: Partial<UploadJob> = {};
        if (job.kind === "syllabus") {
          const { courseId } = job.metadata;
          const course = courses.find((c) => c.id === courseId);
          const year = Number(/\b(20\d\d)\b/.exec(course?.term ?? "")?.[1]) || new Date().getFullYear();
          // Card 45: the server's reader (Gemini, card 127) reads every syllabus; its message goes to the student.
          const result = await server.syllabus.extract(job.id, year);
          events = normalizeEvents(result.events).map(({ source, time, location, needsReview, ...event }) => ({
            ...event, id: "", courseId, time: time ?? "", location: location ?? "", description: source, source: "imported",
            // With no date posted it stays unchecked: the student sees it, and adds a date only if they want it.
            // A span or week item is placed on the review screen, which decides whether it starts checked.
            ...(needsReview ? (event.rangeStart || event.week ? { needsReview } : { needsReview, include: false }) : {}),
          }));
          const found = normalizeMeetings(result.meetings);
          // A class offered at several times is one the student attends only once, so they pick theirs.
          const chooses = (kind: string) => found.filter((m) => m.kind === kind && m.section).length > 1;
          const meetings = found.map(({ firstDate, lastDate, ...m }): DetectedMeeting => ({
            ...m, title: [m.title, m.section].filter(Boolean).join(" "), include: !(m.section && chooses(m.kind)),
            // The syllabus's own dates come first; the course's are the fallback.
            starts: firstDate || (course?.classesStart ?? ""), ends: lastDate || (course?.classesEnd ?? ""),
          }));
          read = { meetings, noClassDates: normalizeBreaks(result.noClassDates), isSyllabus: result.isSyllabus !== false };
        }
        // Card 35: a note gets its course and lecture date from its TXT/Markdown text or its file name.
        // Anything not found stays empty for the student to fill in, rather than guessing.
        let note: Partial<Pick<UploadJob, "metadata">> = {};
        if (job.kind !== "syllabus")
          note = { metadata: { ...job.metadata, ...detectNoteMetadata(job.body ?? "", job.name, courses) } };
        const missing = !!note.metadata && (!note.metadata.courseId || !note.metadata.lectureDate);
        const partial = scenario === "partial" || missing || events.some((e) => e.needsReview);
        return { ...job, ...note, state: partial ? "partial" : "review", events, ...read };
      },
      async confirm(job) {
        if (job.state !== "review" && job.state !== "partial")
          throw new Error("This upload is not ready to save.");
        if (job.kind === "syllabus") {
          // Events the student left out are skipped, and review-only fields aren't saved (card 46).
          const included = job.events.filter((e) => e.include !== false);
          const { courseId } = job.metadata;
          const code = (await repo.courses.list()).find((c) => c.id === courseId)?.code ?? "";
          // Each weekly class becomes one event per meeting, tied together by its series number.
          const classes = (job.meetings ?? []).filter((m) => m.include).flatMap((m, series) =>
            meetingDates(m, job.noClassDates).map((date) => ({
              title: m.title.startsWith(code) ? m.title : `${code} ${m.title}`.trim(),
              kind: m.kind, date, time: m.time, location: m.location, series,
            })));
          const first = [...included.map((e) => e.date), ...classes.map((c) => c.date)].sort()[0] ?? "";
          // The events are saved on the server with the job (cards 47 and 48).
          const saved = await server.syllabus.confirm(job.id, courseId, [...included.map(({ title, kind, date, time, location }) => ({ title, kind, date, time, location })), ...classes]);
          return { ...saved, first };
        }
        await repo.notes.create({
          ...job.metadata,
          format: "text",
          body: job.body ?? `Imported from ${job.name}.\n\nYour document is ready to organize. Add your notes here.`,
        });
        return { created: 0, skipped: 0, first: "" };
      },
    },
  };
  return repo;
}
