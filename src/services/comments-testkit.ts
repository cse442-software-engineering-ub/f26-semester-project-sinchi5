import { createMockCollaborators } from "./collaborators.mock";
import { createMockComments } from "./comments.mock";
import type { Comment, Note, User } from "../domain";

// Test helper for the comment tests (#65, #69).
//
// The mock repository can no longer sign in as an arbitrary person: login
// now goes through the PHP account service, so auth.signIn() in the mock
// throws and the only mock identity left is the demo user. These tests
// therefore drive the comment mock directly, the same way the collaborator
// tests drive createMockCollaborators(), and switch db.user to act as
// different people. Invitations come from the real collaborator mock.
//
// Every mock user shares the literal id "student", so tests compare people
// by name and email rather than by id.
type Saved = { notes: Note[]; comments: Comment[] };

export function commentWorld(saved?: Saved) {
  const notes: Note[] = saved ? structuredClone(saved.notes) : [];
  const db: { comments: Comment[]; user: User | null } = {
    comments: saved ? structuredClone(saved.comments) : [],
    user: null,
  };
  const collaborators = createMockCollaborators();
  let snapshot: Saved = { notes: structuredClone(notes), comments: structuredClone(db.comments) };
  const get = (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) throw new Error("This note could not be found.");
    return note;
  };
  const persist = () => {
    snapshot = { notes: structuredClone(notes), comments: structuredClone(db.comments) };
  };
  const repo = createMockComments(db, get, persist, (noteId) =>
    collaborators.collaborators(noteId),
  );
  return {
    db,
    repo,
    collaborators,
    signInAs(email: string, name: string) {
      db.user = { id: "student", email, name };
    },
    signOut() {
      db.user = null;
    },
    addNote(fields: Partial<Note> & { ownerEmail?: string }): Note {
      const now = "2026-09-01T00:00:00.000Z";
      const note: Note = {
        id: `note-${notes.length + 1}`,
        title: "Shared note",
        body: "Original content",
        courseId: "cse442",
        lectureDate: "2026-09-01",
        category: "School",
        visibility: "shared",
        tags: [],
        createdAt: now,
        updatedAt: now,
        pinned: false,
        ...fields,
      };
      notes.push(note);
      persist();
      return note;
    },
    // A fresh instance over whatever was persisted. Like a real page reload
    // it starts signed out, and the collaborator mock starts empty because
    // invitations are held in memory only.
    reload() {
      return commentWorld(snapshot);
    },
  };
}
