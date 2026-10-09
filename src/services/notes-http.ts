import type { Collaborator, Comment, Course, Note, NoteRepository, NoteVersion } from "../domain";
import { filterNotes } from "./repositories";
import { dateKey } from "./fixtures";

export class NoteServiceError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const NOTE_CATEGORIES = ["School", "Work", "Meetings", "Personal"];

// Server-backed notes for signed-in accounts (task #120). The demo keeps notes in the browser.
export function createHttpNotes(
  courses: () => Promise<Course[]>,
  endpoint = `${import.meta.env.BASE_URL}api/index.php`,
  fetcher: typeof fetch = fetch,
): NoteRepository {
  let csrf = "";
  async function send<T>(route: string, data?: object, retry = true): Promise<T> {
    if (data && !csrf) csrf = (await send<{ csrfToken: string }>("session")).csrfToken;
    let response: Response;
    try {
      response = await fetcher(`${endpoint}?route=${route}`, {
        method: data ? "POST" : "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        headers: data ? { "Content-Type": "application/json", "X-CSRF-Token": csrf } : {},
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
    } catch {
      throw new NoteServiceError("Could not reach your notes. Check your connection and try again.", 0);
    }
    const body = await response.json().catch(() => null);
    // A new sign-in changes the session's CSRF token; fetch it again once.
    if (response.status === 403 && data && retry && /session changed/i.test(body?.error || "")) {
      csrf = "";
      return send(route, data, false);
    }
    if (!response.ok) throw new NoteServiceError(body?.error || "Your notes are unavailable. Please try again later.", response.status);
    return body as T;
  }
  const query = (route: string, noteId: string) => `${route}&id=${encodeURIComponent(noteId)}`;
  const content = (note: Partial<Note>) => ({
    title: note.title, body: note.body, courseId: note.courseId, lectureDate: note.lectureDate,
    category: note.category, visibility: note.visibility, tags: note.tags,
  });
  return {
    async list(q) {
      // Let the server narrow by category (card 41). The other filters and the sort stay in the
      // browser, which also re-applies the category, so an unknown value just gives an empty list.
      const category = NOTE_CATEGORIES.includes(q?.category ?? "") ? `&category=${encodeURIComponent(q!.category!)}` : "";
      const { notes } = await send<{ notes: Note[] }>(`notes${category}`);
      return filterNotes(notes, q, await courses());
    },
    async get(noteId) {
      return (await send<{ note: Note }>(query("note", noteId))).note;
    },
    async create(data) {
      const note = { title: "Untitled note", body: "", courseId: "", lectureDate: dateKey(), category: "School",
        visibility: "private" as const, tags: [], ...data };
      return (await send<{ note: Note }>("note-create", content(note))).note;
    },
    async save(note) {
      return (await send<{ note: Note }>("note-save", { id: note.id, ...content(note) })).note;
    },
    async setPinned(noteId, pinned) {
      return (await send<{ note: Note }>("note-pin", { id: noteId, pinned })).note;
    },
    async delete(noteId) {
      await send("note-delete", { id: noteId });
    },
    async versions(noteId) {
      return (await send<{ versions: NoteVersion[] }>(query("note-versions", noteId))).versions;
    },
    async restore(noteId, versionId) {
      return (await send<{ note: Note }>("note-restore", { id: noteId, versionId })).note;
    },
    // The prototype preview options can still slow down or fail comment requests on purpose.
    async comments(noteId, scenario = "success") {
      if (scenario !== "success") await wait(scenario === "slow" ? 600 : 300);
      if (scenario === "failure") throw new Error("Comments could not be loaded.");
      return (await send<{ comments: Comment[] }>(query("note-comments", noteId))).comments;
    },
    async comment(noteId, body, scenario = "success") {
      if (scenario !== "success") await wait(scenario === "slow" ? 600 : 300);
      if (scenario === "failure") throw new Error("Your comment could not be posted.");
      return (await send<{ comment: Comment }>("note-comment", { id: noteId, body })).comment;
    },
    async collaborators(noteId) {
      return (await send<{ collaborators: Collaborator[] }>(query("note-collaborators", noteId))).collaborators;
    },
    async inviteCollaborator(noteId, email) {
      return send<{ collaborator: Collaborator }>("note-invite", { id: noteId, email });
    },
    async setCollaboratorPermission(noteId, collaboratorId, permission) {
      return (await send<{ collaborator: Collaborator }>("note-permission", { id: noteId, userId: collaboratorId, permission })).collaborator;
    },
  };
}
