import { describe, expect, it } from "vitest";
import { createRepositories } from "./repositories";
import type { Comment } from "../domain";

// Task #65: comment permission enforcement.
//
// Every mock user shares the literal id "student" (see auth.signIn in
// repositories.ts) - there's no per-account id in this prototype. So these
// tests compare authors by name/email, which actually varies between
// accounts, rather than by authorId. A test asserting authorId differs
// between two signed-in users would prove nothing today; that only becomes
// meaningful once sign-in assigns real, distinct ids.
//
// These tests all create fresh notes via notes.create(), so they get a
// real ownerEmail and the new gate applies. Notes seeded before this task
// (e.g. the fixtures used elsewhere in this app) never get ownerEmail
// backfilled and are legacy: the gate is not enforced on them, and they
// keep today's signed-in-and-shared-only behavior unchanged.

describe("comment permission enforcement", () => {
  it("Test 1 - an authorized collaborator can comment, and the author is that user, not the owner", async () => {
    const r = createRepositories();
    await r.auth.signIn("owner@example.edu", "Owner Person");
    const note = await r.notes.create({
      title: "Shared note",
      body: "Original content",
      visibility: "shared",
    });
    await r.notes.inviteCollaborator(note.id, "jamie@example.edu");
    await r.auth.signIn("jamie@example.edu", "Jamie");
    const posted = await r.notes.comment(note.id, "This looks great.");
    expect(posted.author).toBe("Jamie");
    expect(posted.author).not.toBe("Owner Person");
  });

  it("Test 2 - rejects when signed out, on a private note, and when not on the collaborator list", async () => {
    const r = createRepositories();
    await r.auth.signIn("owner@example.edu", "Owner Person");
    const sharedNote = await r.notes.create({
      title: "Shared note",
      body: "Original content",
      visibility: "shared",
    });

    // (a) signed out entirely
    await r.auth.signOut();
    await expect(r.notes.comment(sharedNote.id, "hi")).rejects.toThrow(
      "signed in",
    );

    // (b) on a private note, even for its own owner
    await r.auth.signIn("owner@example.edu", "Owner Person");
    const privateNote = await r.notes.create({
      title: "Private note",
      body: "Original content",
      visibility: "private",
    });
    await expect(r.notes.comment(privateNote.id, "hi")).rejects.toThrow(
      "Share",
    );

    // (c) shared note, but this user is neither the owner nor invited
    await r.auth.signIn("stranger@example.edu", "Stranger");
    await expect(r.notes.comment(sharedNote.id, "hi")).rejects.toThrow(
      "access",
    );
  });

  it("Test 3 - forged author id and creation time have no effect", async () => {
    const r = createRepositories();
    await r.auth.signIn("owner@example.edu", "Owner Person");
    const note = await r.notes.create({
      title: "Shared note",
      body: "Original content",
      visibility: "shared",
    });
    const forged = {
      authorId: "someone-elses-id",
      createdAt: "2000-01-01T00:00:00.000Z",
    };
    // comment()'s real signature is (id, body, scenario) - there's no
    // parameter for author or creation time at all. This cast simulates a
    // caller trying to smuggle extra fields through anyway; since the
    // function never reads a 4th argument, they're simply dropped.
    const posted = await (
      r.notes.comment as unknown as (
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
    const r = createRepositories();
    await r.auth.signIn("owner@example.edu", "Owner Person");
    const note = await r.notes.create({
      title: "Shared note",
      body: "Original content",
      visibility: "shared",
    });
    const posted = await r.notes.comment(note.id, "Note to self.");
    expect(posted.author).toBe("Owner Person");
  });
});
