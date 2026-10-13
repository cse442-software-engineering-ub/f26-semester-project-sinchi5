// Browser wiring fixture only. PHP security is tested independently in backend/tests.
import { test as base, expect } from "@playwright/test";
const CODE = "ABCD-1234-ABCD-1234-ABCD-1234-ABCD-1234";
type Account = { id: string; name: string; email: string; password: string; code: string; completed: boolean };
type Note = {
  id: string; ownerId: string; title: string; body: string; courseId: string; lectureDate: string; category: string;
  visibility: string; tags: string[]; pinned: boolean; createdAt: string; updatedAt: string;
};
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export const test = base.extend<{ accountApi: void }>({
  accountApi: [async ({ context }, use) => {
    // Several accounts can share one browser, so tests can switch between students.
    const accounts = new Map<string, Account>();
    let nextAccount = 42;
    let user: Account | null = null;
    // In-memory stand-in for the card 120 note routes, following the PHP access rules.
    const notes = new Map<string, Note>();
    const editors = new Map<string, Map<string, "view" | "edit">>();
    let versions: { id: string; noteId: string; title: string; body: string; author: string; createdAt: string }[] = [];
    let comments: { id: string; noteId: string; body: string; author: string; authorId: string; createdAt: string }[] = [];
    let nextId = 1;
    const now = () => new Date().toISOString();
    const publicUser = (a: Account | null) => a && { id: a.id, name: a.name, email: a.email };
    const role = (noteId: string) => {
      const note = notes.get(noteId);
      if (!note) throw new ApiError(404, "This note could not be found.");
      if (note.ownerId === user!.id) return "owner";
      return editors.get(noteId)?.get(user!.id) ?? "none";
    };
    const readable = (noteId: string) => { if (role(noteId) === "none") throw new ApiError(404, "This note could not be found."); };
    const editable = (noteId: string) => {
      if (!["owner", "edit"].includes(role(noteId))) throw new ApiError(403, "You do not have permission to edit this note.");
    };
    const owned = (noteId: string, message: string) => { if (role(noteId) !== "owner") throw new ApiError(403, message); };
    const collaborator = (noteId: string, userId: string) => {
      const a = [...accounts.values()].find((entry) => entry.id === userId)!;
      return { ...publicUser(a)!, permission: editors.get(noteId)!.get(userId)! };
    };
    const removeNote = (noteId: string) => {
      notes.delete(noteId);
      editors.delete(noteId);
      versions = versions.filter((v) => v.noteId !== noteId);
      comments = comments.filter((c) => c.noteId !== noteId);
    };
    function noteRoute(action: string, query: URLSearchParams, body: Record<string, unknown>) {
      if (!user) throw new ApiError(401, "Sign in to continue.");
      const id = String(query.get("id") ?? body.id ?? "");
      const content = (note: Partial<Note>) => ({
        title: String(body.title ?? note.title), body: String(body.body ?? note.body ?? ""),
        courseId: String(body.courseId ?? note.courseId ?? ""), lectureDate: String(body.lectureDate ?? note.lectureDate ?? ""),
        category: String(body.category ?? note.category ?? "School"), visibility: String(body.visibility ?? note.visibility ?? "private"),
        tags: (body.tags ?? note.tags ?? []) as string[],
      });
      if (action === "notes") {
        return { notes: [...notes.values()].filter((n) => n.ownerId === user!.id || editors.get(n.id)?.has(user!.id)) };
      }
      if (action === "note-create") {
        const note = { id: String(nextId++), ownerId: user.id, pinned: false, createdAt: now(), updatedAt: now(), ...content({}) };
        notes.set(note.id, note);
        editors.set(note.id, new Map());
        return { note };
      }
      if (action === "note") { readable(id); return { note: notes.get(id) }; }
      if (action === "note-versions") { readable(id); return { versions: versions.filter((v) => v.noteId === id) }; }
      if (action === "note-comments") { readable(id); return { comments: comments.filter((c) => c.noteId === id) }; }
      if (action === "note-collaborators") {
        readable(id);
        return { collaborators: [...editors.get(id)!.keys()].map((userId) => collaborator(id, userId)) };
      }
      if (action === "note-save" || action === "note-restore") {
        editable(id);
        const note = notes.get(id)!;
        const version = versions.find((v) => v.id === body.versionId && v.noteId === id);
        if (action === "note-restore" && !version) throw new ApiError(404, "Version not found.");
        const next = action === "note-save" ? content(note) : { ...note, title: version!.title, body: version!.body };
        if (next.title !== note.title || next.body !== note.body) {
          versions.unshift({ id: String(nextId++), noteId: id, title: note.title, body: note.body, author: user.name, createdAt: note.updatedAt });
        }
        notes.set(id, { ...note, ...next, updatedAt: now() });
        return { note: notes.get(id) };
      }
      if (action === "note-pin") {
        editable(id);
        notes.set(id, { ...notes.get(id)!, pinned: body.pinned === true });
        return { note: notes.get(id) };
      }
      if (action === "note-delete") {
        owned(id, "Only the note's owner can delete it.");
        removeNote(id);
        return { note: { id } };
      }
      if (action === "note-comment") {
        readable(id);
        if (notes.get(id)!.visibility !== "shared") throw new ApiError(422, "Share this note before adding comments.");
        const comment = { id: String(nextId++), noteId: id, body: String(body.body).trim(), author: user.name, authorId: user.id, createdAt: now() };
        comments.push(comment);
        return { comment };
      }
      if (action === "note-invite") {
        owned(id, "Only the note's owner can invite collaborators.");
        const invitee = accounts.get(String(body.email).trim().toLowerCase());
        if (!invitee) throw new ApiError(404, "No registered account was found for this email.");
        if (invitee.id === user.id) throw new ApiError(422, "You already own this note.");
        if (!editors.get(id)!.has(invitee.id)) editors.get(id)!.set(invitee.id, "view");
        return { collaborator: collaborator(id, invitee.id) };
      }
      if (action === "note-permission") {
        owned(id, "Only the note's owner can change permissions.");
        if (!editors.get(id)!.has(String(body.userId))) throw new ApiError(404, "Collaborator not found.");
        editors.get(id)!.set(String(body.userId), body.permission === "edit" ? "edit" : "view");
        return { collaborator: collaborator(id, String(body.userId)) };
      }
      throw new ApiError(404, "This action was not found.");
    }
    await context.route("**/api/index.php?route=*", async route => {
      const query = new URL(route.request().url()).searchParams;
      const action = query.get("route")!;
      const body = route.request().postDataJSON() || {};
      if (action.startsWith("note")) {
        try {
          await route.fulfill({ status: action === "note-create" ? 201 : 200, json: noteRoute(action, query, body) });
        } catch (e) {
          await route.fulfill({ status: (e as ApiError).status ?? 500, json: { error: (e as Error).message } });
        }
        return;
      }
      let error = ""; let status = 200; let recoveryCode: string | undefined;
      const email = String(body.email ?? "").toLowerCase().trim();
      if (action === "register") {
        user = { id: String(nextAccount++), name: body.name, email, password: body.password, code: CODE, completed: false };
        accounts.set(email, user); recoveryCode = user.code;
      } else if (action === "login") {
        const account = accounts.get(email);
        if (!account || body.password !== account.password) { error = "Email or password is incorrect."; status = 401; }
        else user = account;
      } else if (action === "onboarding") user!.completed = true;
      else if (action === "logout") user = null;
      else if (action === "profile") {
        accounts.delete(user!.email);
        Object.assign(user!, { name: body.name, email: body.email });
        accounts.set(user!.email, user!);
      } else if (action === "password" || action === "delete" || action === "recovery-code") {
        if (body.currentPassword !== user?.password) { error = "Your current password is incorrect."; status = 422; }
        else if (action === "password") user.password = body.password;
        else if (action === "delete") {
          for (const note of [...notes.values()]) if (note.ownerId === user.id) removeNote(note.id);
          for (const list of editors.values()) list.delete(user.id);
          accounts.delete(user.email); user = null;
        } else { user.code = "BEEF-5678-BEEF-5678-BEEF-5678-BEEF-5678"; recoveryCode = user.code; }
      } else if (action === "reset-password") {
        const account = accounts.get(email);
        if (!account || account.code !== body.recoveryCode) { error = "Email or recovery code is incorrect."; status = 422; }
        else { account.password = body.password; user = null; account.code = "CDEF-5678-CDEF-5678-CDEF-5678-CDEF-5678"; recoveryCode = account.code; }
      }
      const completed = !!user && user.completed;
      await route.fulfill({ status, json: error ? { error } : { user: publicUser(user), onboarding: { completed, step: completed ? 3 : 0 }, csrfToken: "fixture-csrf", ...(recoveryCode ? { recoveryCode } : {}) } });
    });
    await use();
  }, { auto: true }],
});
export { expect };
