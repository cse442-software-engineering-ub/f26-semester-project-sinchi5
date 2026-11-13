// Browser wiring fixture only. PHP security is tested independently in backend/tests.
import { test as base, expect } from "@playwright/test";
const CODE = "ABCD-1234-ABCD-1234-ABCD-1234-ABCD-1234";
type Account = { id: string; name: string; email: string; password: string; code: string; completed: boolean;
  photo?: { content: string; mime: string } };
type Note = {
  checklist: { text: string; done: boolean }[];
  id: string; ownerId: string; title: string; body: string; courseId: string; lectureDate: string; category: string;
  visibility: string; tags: string[]; pinned: boolean; createdAt: string; updatedAt: string;
};
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
const IMPORT_ROUTES = ["syllabus-upload", "import-job", "import-extract", "import-confirm", "events", "event-delete"];
// What the fake server reader "finds" in any uploaded PDF, Word file, or image.
export const SYLLABUS_PDF_EVENTS = [
  { title: "Reading response 1", kind: "assignment", date: "2026-09-21", time: "23:59", location: "", source: "Reading response 1 due Sept. 21" },
  { title: "Lab practical", kind: "exam", date: "", time: "", location: "", source: "Lab practical: date TBA" },
];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LINE = new RegExp(String.raw`^(.+?)(?: due)? (${MONTHS.join("|")}) (\d{1,2}), (\d{4})(?: at (\d{1,2}):(\d{2}) (AM|PM))?$`);
const eventKind = (title: string) => (/exam|midterm/i.test(title) ? "exam" : /quiz/i.test(title) ? "quiz" : /project|paper/i.test(title) ? "deadline" : "assignment");
// The fake reader, so tests never call Gemini. Text that is JSON is the read itself, which lets a test ask
// for any answer. Otherwise a line ending in a date is one event, and a line with "next" is one with no date.
function fakeRead(text: string) {
  const empty = { isSyllabus: true, meetings: [], noClassDates: [] };
  if (text.startsWith("{")) return { ...empty, events: [], ...JSON.parse(text) };
  const events = text.split("\n").flatMap((source) => {
    const dated = LINE.exec(source);
    if (dated) {
      const [, title, month, day, year, hour, minute, half] = dated;
      const time = hour ? `${String((+hour % 12) + (half === "PM" ? 12 : 0)).padStart(2, "0")}:${minute}` : "";
      const date = `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
      return [{ title, kind: eventKind(title), date, time, location: "", source }];
    }
    const undated = /^(.+?) next /.exec(source);
    return undated ? [{ title: undated[1], kind: eventKind(undated[1]), date: "", time: "", location: "", source }] : [];
  });
  return { ...empty, events };
}

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
    const publicUser = (a: Account | null) => a && { id: a.id, name: a.name, email: a.email, hasPhoto: !!a.photo };
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
        // Task #78 browser fixture mirrors #79; this is not database persistence evidence.
        checklist: ((body.checklist ?? note.checklist ?? []) as Note["checklist"])
          .filter((item) => item.text.trim()).map(({ text, done }) => ({ text, done })),
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
    // In-memory stand-in for the syllabus routes (cards 43 and 45), following the PHP rules. Its reader
    // never calls the Gemini API (see fakeRead), and a file named limit.<type> hits the daily limit.
    const jobs = new Map<string, { id: string; ownerId: string; courseId: string; name: string; type: string; state: string; events: unknown[] }>();
    const jobTexts = new Map<string, string>();
    let savedEvents: Record<string, string>[] = [];
    function importRoute(action: string, query: URLSearchParams, body: Record<string, unknown>) {
      if (!user) throw new ApiError(401, "Sign in to continue.");
      if (action === "syllabus-upload") {
        const name = String(body.fileName ?? "");

        if (name === "failed-read.txt") {
          throw new ApiError(
            500,
            "That file needs another try",
          );
        }

        const type = name
          .split(".")
          .pop()!
          .toLowerCase()
          .replace("jpeg", "jpg");

        if (
          ![
            "pdf",
            "docx",
            "txt",
            "md",
            "jpg",
            "png",
            "webp",
          ].includes(type)
        ) {
          throw new ApiError(
            422,
            "Choose a PDF, DOCX, TXT, Markdown, or supported image file.",
          );
        }

        if (!body.content) {
          throw new ApiError(
            422,
            "This file is empty. Please choose another.",
          );
        }

        const job = {
          id: String(nextId++),
          ownerId: user.id,
          courseId: String(body.courseId),
          name,
          type,
          state: "queued",
          events: [],
        };

        jobs.set(job.id, job);
        jobTexts.set(job.id, Buffer.from(String(body.content), "base64").toString());

        return { job };
      }
      if (action === "events") {
        return { events: savedEvents.filter((e) => e.ownerId === user!.id).map(({ ownerId: _owner, ...e }) => e) };
      }
      // Like the PHP route (card 172): another student's event looks the same as a missing one.
      if (action === "event-delete") {
        const index = savedEvents.findIndex((e) => e.id === String(body.id) && e.ownerId === user!.id);
        if (index < 0) throw new ApiError(404, "This event could not be found.");
        const series = body.series === true ? savedEvents[index].seriesId : undefined;
        savedEvents = series ? savedEvents.filter((e) => e.seriesId !== series || e.ownerId !== user!.id) : savedEvents.filter((_, i) => i !== index);
        return { event: { id: String(body.id) } };
      }
      const job = jobs.get(String(query.get("id") ?? body.id));
      if (!job || job.ownerId !== user.id) throw new ApiError(404, "This upload could not be found.");
      if (action === "import-job") return { job };
      if (action === "import-confirm") {
        const reviewed = (Array.isArray(body.events) ? body.events : []) as Record<string, string>[];
        if (!reviewed.length || reviewed.length > 600) throw new ApiError(422, "Choose 1 to 600 events to add.");
        if (reviewed.some((e) => !String(e.title ?? "").trim() || !e.date)) throw new ApiError(422, "Give every event a title and a date.");
        // Like the PHP route, a completed job adds nothing the second time.
        if (job.state === "completed") return { created: 0, skipped: 0 };
        const courseId = String(body.courseId ?? job.courseId);
        // An event the course already has is skipped, so uploading again can't double the schedule.
        const fresh = reviewed.filter((e) => !savedEvents.some((s) => s.ownerId === user!.id && s.courseId === courseId
          && s.title === e.title.trim() && s.date === e.date && s.time === (e.time ?? "")));
        for (const e of fresh) {
          savedEvents.push({ id: String(nextId++), ownerId: user.id, courseId,
            title: e.title.trim(), kind: e.kind ?? "other", date: e.date, time: e.time ?? "", location: e.location ?? "", description: "",
            source: "imported", importJobId: job.id, ...(e.series === undefined ? {} : { seriesId: `${job.id}-${e.series}` }) });
        }
        job.state = "completed";
        return { created: fresh.length, skipped: reviewed.length - fresh.length };
      }
      if (job.name.startsWith("limit.")) {
        job.state = "failed";
        throw new ApiError(
          429,
          "You can read 10 syllabi automatically each day. Try again tomorrow.",
        );
      }

      Object.assign(job, {
        state: "review",
        ...(["txt", "md"].includes(job.type) ? fakeRead(jobTexts.get(job.id)!) : { ...fakeRead(""), events: SYLLABUS_PDF_EVENTS }),
      });

      return { job };
    }
    // In-memory stand-in for the card 153 friend routes, following the PHP rules.
    let friendships: { id: string; from: string; to: string; accepted: boolean }[] = [];
    function friendRoute(action: string, body: Record<string, unknown>) {
      if (!user) throw new ApiError(401, "Sign in to continue.");
      const me = user.id;
      const mine = (f: (typeof friendships)[number]) => f.from === me || f.to === me;
      let created = false;
      if (action === "friend-request") {
        const email = String(body.email ?? "").trim().toLowerCase();
        // The common validEmail() messages from backend/lib/security.php.
        if (!email) throw new ApiError(422, "Enter your email address.");
        if (/\s/.test(email)) throw new ApiError(422, "Email addresses can’t contain spaces.");
        if (email.split("@").length !== 2) throw new ApiError(422, "Email addresses need exactly one @, like name@university.edu.");
        if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) throw new ApiError(422, "Enter a complete email address, like name@university.edu.");
        const them = accounts.get(email);
        if (!them) throw new ApiError(404, "No registered account was found for this email.");
        if (them.id === me) throw new ApiError(422, "You can’t add yourself as a friend.");
        const row = friendships.find((f) => mine(f) && (f.from === them.id || f.to === them.id));
        if (row?.accepted) throw new ApiError(409, "You’re already friends with this person.");
        if (row?.from === me) throw new ApiError(409, "You already sent this person a friend request.");
        if (row) row.accepted = true;
        else { friendships.push({ id: String(nextId++), from: me, to: them.id, accepted: false }); created = true; }
      } else if (action === "friend-respond") {
        if (typeof body.accept !== "boolean") throw new ApiError(422, "Choose whether to accept this request.");
        const row = friendships.find((f) => f.id === String(body.id) && f.to === me && !f.accepted);
        if (!row) throw new ApiError(404, "This friend request could not be found.");
        if (body.accept) row.accepted = true;
        else friendships = friendships.filter((f) => f !== row);
      } else if (action === "friend-remove") {
        const row = friendships.find((f) => f.id === String(body.id) && f.accepted && mine(f));
        if (!row) throw new ApiError(404, "This friend request could not be found.");
        friendships = friendships.filter((f) => f !== row);
        // Card 156: courses either of them shared with the other stop being shared.
        courseShares = courseShares.filter((c) => !([c.owner, c.friend].includes(row.from) && [c.owner, c.friend].includes(row.to)));
      }
      const view = (f: (typeof friendships)[number]) => {
        const other = [...accounts.values()].find((a) => a.id === (f.from === me ? f.to : f.from))!;
        return { id: f.id, userId: other.id, name: other.name, email: other.email };
      };
      const rows = friendships.filter(mine).sort((a, b) => view(a).name.localeCompare(view(b).name));
      return { status: created ? 201 : 200, json: {
        friends: rows.filter((f) => f.accepted).map(view),
        incoming: rows.filter((f) => !f.accepted && f.to === me).map(view),
        outgoing: rows.filter((f) => !f.accepted && f.from === me).map(view),
      } };
    }
    // In-memory stand-in for the card 156 course-sharing routes, following the PHP rules.
    let courseShares: { owner: string; courseId: string; courseCode: string; friend: string }[] = [];
    const FRIENDS_ONLY = "You can share notes only with friends.";
    const areFriends = (a: string, b: string) =>
      friendships.some((f) => f.accepted && ((f.from === a && f.to === b) || (f.from === b && f.to === a)));
    function shareRoute(action: string, query: URLSearchParams, body: Record<string, unknown>) {
      if (!user) throw new ApiError(401, "Sign in to continue.");
      const me = user.id;
      const courseId = String((action === "course-notes-shares" ? query.get("courseId") : body.courseId) ?? "");
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(courseId)) throw new ApiError(422, "Choose a valid course.");
      const list = () => courseShares.filter((c) => c.owner === me && c.courseId === courseId && areFriends(me, c.friend))
        .map((c) => [...accounts.values()].find((a) => a.id === c.friend)!)
        .sort((a, b) => a.name.localeCompare(b.name)).map((a) => ({ userId: a.id, name: a.name, email: a.email }));
      if (action === "course-notes-shares") return { shares: list() };
      if (typeof body.courseCode !== "string" || !body.courseCode.trim()) throw new ApiError(422, "Choose a valid course.");
      const ids = body.friendIds;
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id === me || !areFriends(me, id))) {
        throw new ApiError(422, FRIENDS_ONLY);
      }
      courseShares = courseShares.filter((c) => !(c.owner === me && c.courseId === courseId));
      for (const friend of new Set(ids as string[])) courseShares.push({ owner: me, courseId, courseCode: body.courseCode.trim(), friend });
      return { shares: list() };
    }
    await context.route("**/api/index.php?route=*", async route => {
      const query = new URL(route.request().url()).searchParams;
      const action = query.get("route")!;
      const body = route.request().postDataJSON() || {};
      if (action === "course-notes-share" || action === "course-notes-shares") {
        try {
          await route.fulfill({ json: shareRoute(action, query, body) });
        } catch (e) {
          await route.fulfill({ status: (e as ApiError).status ?? 500, json: { error: (e as Error).message } });
        }
        return;
      }
      if (action.startsWith("friend")) {
        try {
          await route.fulfill(friendRoute(action, body));
        } catch (e) {
          await route.fulfill({ status: (e as ApiError).status ?? 500, json: { error: (e as Error).message } });
        }
        return;
      }
      if (action === "profile-photo" || action === "profile-photo-remove") {
        try {
          const method = route.request().method();
          if (!(method === "POST" || (action === "profile-photo" && method === "GET"))) {
            throw new ApiError(405, "This request method is not supported.");
          }
          if (!user) throw new ApiError(401, "Sign in to continue.");
          if (method === "GET") {
            if (!user.photo) throw new ApiError(404, "No profile photo yet.");
            await route.fulfill({ contentType: user.photo.mime, body: Buffer.from(user.photo.content, "base64"),
              headers: { "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline", "Cache-Control": "private, no-cache" } });
            return;
          }
          if (route.request().headers()["x-csrf-token"] !== "fixture-csrf") {
            throw new ApiError(403, "Your session changed. Reload the page and try again.");
          }
          if (action === "profile-photo-remove") user.photo = undefined;
          else {
            if (typeof body.content !== "string" || !body.content || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.content)) {
              throw new ApiError(422, "This image could not be read. Try another file.");
            }
            const bytes = Buffer.from(body.content, "base64");
            if (bytes.length > 2 * 1024 * 1024) throw new ApiError(413, "Profile pictures can be at most 2 MB.");
            const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
              : bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? "image/jpeg"
              : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" ? "image/webp" : "";
            if (!mime) throw new ApiError(422, "Choose a PNG, JPEG, or WebP image.");
            if (bytes.length <= 24 || (mime === "image/png" && (bytes.readUInt32BE(16) < 32 || bytes.readUInt32BE(20) < 32))) {
              throw new ApiError(422, "This image could not be read. Try another file.");
            }
            user.photo = { content: body.content, mime };
          }
          const completed = user.completed;
          await route.fulfill({ json: { user: publicUser(user), onboarding: { completed, step: completed ? 3 : 0 }, csrfToken: "fixture-csrf" } });
        } catch (e) {
          await route.fulfill({ status: (e as ApiError).status ?? 500, json: { error: (e as Error).message } });
        }
        return;
      }
      if (action.startsWith("note")) {
        try {
          await route.fulfill({ status: action === "note-create" ? 201 : 200, json: noteRoute(action, query, body) });
        } catch (e) {
          await route.fulfill({ status: (e as ApiError).status ?? 500, json: { error: (e as Error).message } });
        }
        return;
      }
      if (IMPORT_ROUTES.includes(action)) {
        try {
          await route.fulfill({ status: action === "syllabus-upload" ? 201 : 200, json: importRoute(action, query, body) });
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
          savedEvents = savedEvents.filter((e) => e.ownerId !== user!.id);
          for (const list of editors.values()) list.delete(user.id);
          friendships = friendships.filter((f) => f.from !== user!.id && f.to !== user!.id);
          courseShares = courseShares.filter((c) => c.owner !== user!.id && c.friend !== user!.id);
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
