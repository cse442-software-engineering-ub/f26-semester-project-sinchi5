import { describe, expect, it } from "vitest";
import { commentWorld } from "./comments-testkit";
import { createRepositories } from "./repositories";
import type { Comment } from "../domain";

// Task #65: comment permission enforcement.
//
// These tests drive the comment mock directly (see comments-testkit.ts for
// why): sign-in now goes through the PHP account service, so the mock
// repository can only act as the demo user. Every mock user shares the
// literal id "student", so authors are compared by name and email.
//
// All notes here carry an ownerEmail, so the permission gate applies. Notes
// seeded before this task never get ownerEmail backfilled and are legacy:
// the gate is not enforced on them, and they keep today's
// signed-in-and-shared-only behavior unchanged.

describe("comment permission enforcement", () => {
  it("Test 1 - an authorized collaborator can comment, and the author is that user, not the owner", async () => {
    const w = commentWorld();
    w.signInAs("owner@example.edu", "Owner Person");
    const note = w.addNote({ ownerEmail: "owner@example.edu" });
    await w.collaborators.inviteCollaborator(note.id, "jamie@example.edu");
    w.signInAs("jamie@example.edu", "Jamie");
    const posted = await w.repo.comment(note.id, "This looks great.");
    expect(posted.author).toBe("Jamie");
    expect(posted.author).not.toBe("Owner Person");
  });

  it("Test 2 - rejects when signed out, on a private note, and when not on the collaborator list", async () => {
    const w = commentWorld();
    w.signInAs("owner@example.edu", "Owner Person");
    const sharedNote = w.addNote({ ownerEmail: "owner@example.edu" });
    const privateNote = w.addNote({
      title: "Private note",
      visibility: "private",
      ownerEmail: "owner@example.edu",
    });

    // (a) signed out entirely
    w.signOut();
    await expect(w.repo.comment(sharedNote.id, "hi")).rejects.toThrow(
      "signed in",
    );

    // (b) on a private note, even for its own owner
    w.signInAs("owner@example.edu", "Owner Person");
    await expect(w.repo.comment(privateNote.id, "hi")).rejects.toThrow(
      "Share",
    );

    // (c) shared note, but this user is neither the owner nor invited
    w.signInAs("stranger@example.edu", "Stranger");
    await expect(w.repo.comment(sharedNote.id, "hi")).rejects.toThrow(
      "access",
    );
  });

  it("Test 3 - forged author id and creation time have no effect", async () => {
    const w = commentWorld();
    w.signInAs("owner@example.edu", "Owner Person");
    const note = w.addNote({ ownerEmail: "owner@example.edu" });
    const forged = {
      authorId: "someone-elses-id",
      createdAt: "2000-01-01T00:00:00.000Z",
    };
    // comment()'s real signature is (id, body, scenario) - there's no
    // parameter for author or creation time at all. This cast simulates a
    // caller trying to smuggle extra fields through anyway; since the
    // function never reads a 4th argument, they're simply dropped.
    const posted = await (
      w.repo.comment as unknown as (
        id: string,
        body: string,
        scenario: string | undefined,
        forged: Partial<Comment>,
      ) => Promise<Comment>
    )(note.id, "A comment.", undefined, forged);
    expect(posted.authorId).not.toBe("someone-elses-id");
    expect(posted.createdAt).not.toBe("2000-01-01T00:00:00.000Z");
    expect(posted.author).toBe("Owner Person");
  });

  it("Test 4 (extra) - the note's owner can comment", async () => {
    const w = commentWorld();
    w.signInAs("owner@example.edu", "Owner Person");
    const note = w.addNote({ ownerEmail: "owner@example.edu" });
    const posted = await w.repo.comment(note.id, "Note to self.");
    expect(posted.author).toBe("Owner Person");
  });

  it("Test 5 (extra) - a note created through the repository records its owner, who can comment on it", async () => {
    // Uses the real repository wiring, signed in as the demo user - the one
    // identity the mock repository still supports.
    const r = createRepositories();
    await r.auth.startDemo();
    const note = await r.notes.create({
      title: "Shared note",
      body: "Original content",
      visibility: "shared",
    });
    expect(note.ownerEmail).toBe("erin@example.edu");
    const posted = await r.notes.comment(note.id, "Note to self.");
    expect(posted.author).toBe("Erin");
  });
});
