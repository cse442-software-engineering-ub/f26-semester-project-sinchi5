import { describe, expect, it } from "vitest";
import { createRepositories } from "./repositories";

// Task #69: comment persistence and multi-user display.
//
// Scope, as decided: this integrates against the mock repository only. No
// PHP, no real network layer - nothing here should suggest a real backend
// endpoint exists. "Reload" is simulated the same way repositories.test.ts
// already does it: a fresh createRepositories(storage) instance reading the
// same underlying storage, mirroring a real page reload.
//
// Known limitation, found while writing these tests: collaborator
// invitations (from collaborators.mock.ts, Sung's #70/#71/#72 work) are
// kept in a private in-memory Map and are never written to the persisted
// store at all - his own test for it says so explicitly ("without
// persistent storage"). So after a simulated reload, an invited
// collaborator's invitation is gone, even though the *comment* they posted
// persisted correctly. That means: after a reload, a collaborator loses
// access to the note itself, and - because of the new read-side check
// added in this task - they also lose the ability to view its comments.
// This is a pre-existing gap in the collaborator feature, not something
// introduced here, and it's out of scope to fix as part of this task.
// Test 1 below verifies persistence from the *owner's* side instead, since
// ownerEmail is part of the persisted note and does survive a reload.

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) || null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}

describe("comment persistence and multi-user display", () => {
  it("Test 1 - a collaborator's comment persists after reload, exactly once, attributed to them by name", async () => {
    const storage = memory();
    const r = createRepositories(storage);
    await r.auth.signIn("a@example.edu", "Student A");
    const note = await r.notes.create({
      title: "Shared note",
      body: "Original content",
      visibility: "shared",
    });
    await r.notes.inviteCollaborator(note.id, "jamie@example.edu");

    await r.auth.signIn("jamie@example.edu", "Jamie");
    await r.notes.comment(note.id, "This really helped.");

    // Simulate a reload from the owner's side, since ownerEmail is part of
    // the persisted note and survives it (unlike collaborator invitations
    // - see the file-level note above).
    const reloaded = createRepositories(storage);
    await reloaded.auth.signIn("a@example.edu", "Student A");
    const comments = await reloaded.notes.comments(note.id);
    expect(comments).toHaveLength(1);
    expect(comments[0].author).toBe("Jamie");
    expect(comments[0].body).toBe("This really helped.");
  });

  it.todo(
    "collaborator access survives a reload - can't pass yet: collaborators.mock.ts keeps invitations in an in-memory Map only, never persisted to storage, so an invited collaborator's access is lost after a simulated reload even though their comment persisted correctly",
  );

  it("Test 2 - another authorized viewer sees the comment correctly; a third user without access is denied and sees no comment text", async () => {
    const storage = memory();
    const r = createRepositories(storage);
    await r.auth.signIn("a@example.edu", "Student A");
    const note = await r.notes.create({
      title: "Shared note",
      body: "Original content",
      visibility: "shared",
    });
    await r.notes.inviteCollaborator(note.id, "jamie@example.edu");

    await r.auth.signIn("jamie@example.edu", "Jamie");
    await r.notes.comment(note.id, "This really helped.");

    // Student A (the owner) views it next, in the same session - no reload
    // involved here, so the collaborator-persistence gap above doesn't
    // apply to this half of the test.
    await r.auth.signIn("a@example.edu", "Student A");
    const asOwner = await r.notes.comments(note.id);
    expect(asOwner).toHaveLength(1);
    expect(asOwner[0].author).toBe("Jamie");
    expect(asOwner[0].body).toBe("This really helped.");

    // A third student, never invited and not the owner, is denied outright.
    await r.auth.signIn("stranger@example.edu", "Stranger");
    let caught: Error | undefined;
    try {
      await r.notes.comments(note.id);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeDefined();
    expect(caught?.message).toMatch(/access/i);
    // The rejection itself proves no comment array was ever returned - but
    // confirm explicitly that the actual comment text never leaked into
    // whatever did come back (the error message).
    expect(caught?.message).not.toContain("This really helped.");
  });
});
