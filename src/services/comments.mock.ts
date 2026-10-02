import { MAX_COMMENT_LENGTH } from "../domain";
import type { Collaborator, Comment, Note, NoteRepository, User } from "../domain";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createMockComments(
  db: { comments: Comment[]; user: User | null },
  get: (noteId: string) => Note,
  persist: () => void,
  collaborators: (noteId: string) => Promise<Collaborator[]>,
): Pick<NoteRepository, "comments" | "comment"> {
  return {
    async comments(noteId, scenario = "success") {
      if (scenario === "failure") {
        await new Promise((resolve) => setTimeout(resolve, 300));
        throw new Error("Comments could not be loaded.");
      }
      if (scenario === "slow") {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      return db.comments
        .filter((c) => c.noteId === noteId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async comment(noteId, body, scenario = "success") {
      if (!db.user) throw new Error("You must be signed in to comment.");
      const note = get(noteId);
      if (note.visibility !== "shared")
        throw new Error("Share this note before adding comments.");
      // Only enforced when the note actually has a recorded owner - legacy/
      // seeded notes never get ownerEmail backfilled (see notes.create()),
      // so they keep today's signed-in-and-shared-only behavior.
      if (note.ownerEmail) {
        const signedInEmail = normalizeEmail(db.user.email);
        const isOwner = normalizeEmail(note.ownerEmail) === signedInEmail;
        if (!isOwner) {
          const list = await collaborators(noteId);
          const isCollaborator = list.some(
            (c) => normalizeEmail(c.email) === signedInEmail,
          );
          if (!isCollaborator)
            throw new Error(
              "You don't have access to comment on this note.",
            );
        }
      }
      const trimmed = body.trim();
      if (!trimmed) throw new Error("Write a comment first.");
      if (trimmed.length > MAX_COMMENT_LENGTH)
        throw new Error(
          `Comments can be at most ${MAX_COMMENT_LENGTH} characters.`,
        );
      if (scenario === "failure") {
        await new Promise((resolve) => setTimeout(resolve, 300));
        throw new Error("Your comment could not be posted.");
      }
      if (scenario === "slow") {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      const c: Comment = {
        id: crypto.randomUUID(),
        noteId,
        body: trimmed,
        author: db.user?.name || "You",
        authorId: db.user?.id || "student",
        createdAt: new Date().toISOString(),
      };
      db.comments.push(c);
      persist();
      return c;
    },
  };
}
