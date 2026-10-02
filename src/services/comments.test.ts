import { describe, expect, it, vi } from "vitest";
import { createMockComments } from "./comments.mock";
import type { Comment, Note, User } from "../domain";

function setup(user: User | null = { id: "student-1", name: "Jamie", email: "jamie@example.edu" }) {
  const notes: Note[] = [
    {
      id: "note-1",
      title: "Agile development & the Scrum framework",
      body: "",
      courseId: "cse442",
      lectureDate: "2026-09-01",
      category: "School",
      visibility: "shared",
      tags: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      pinned: false,
    },
  ];
  const db = { comments: [] as Comment[], user };
  const get = (noteId: string) => {
    const n = notes.find((n) => n.id === noteId);
    if (!n) throw new Error("This note could not be found.");
    return n;
  };
  const persist = vi.fn();
  const repo = createMockComments(db, get, persist);
  return { db, repo, persist };
}

describe("comments mock: store and retrieve", () => {
  it("Test 1 - saves a valid comment with the correct note and author IDs", async () => {
    const { db, repo } = setup();
    const posted = await repo.comment("note-1", "This explanation helped me.");
    expect(posted.id).toBeTruthy();
    expect(posted.authorId).toBe("student-1");
    expect(posted.author).toBe("Jamie");
    expect(posted.body).toBe("This explanation helped me.");
    expect(posted.createdAt).toBeTruthy();
    const fetched = await repo.comments("note-1");
    expect(fetched).toEqual([posted]);
    expect(db.comments[0].noteId).toBe("note-1");
    expect(db.comments[0].authorId).toBe("student-1");
  });
  it("Test 2 - normalizes whitespace and rejects invalid bodies", async () => {
    const { repo } = setup();
    const posted = await repo.comment("note-1", " Useful example ");
    expect(posted.body).toBe("Useful example");
    await expect(repo.comment("note-1", "   ")).rejects.toThrow(
      "Write a comment first.",
    );
    await expect(
      repo.comment("note-1", "a".repeat(2001)),
    ).rejects.toThrow("2000 characters");
    expect(await repo.comments("note-1")).toHaveLength(1);
  });
  it("Test 3 - returns comments oldest to newest, consistently", async () => {
    const { db, repo } = setup();
    db.comments.push(
      { id: "c-3", noteId: "note-1", body: "third", author: "A", authorId: "a", createdAt: "2026-09-03T00:00:00.000Z" },
      { id: "c-1", noteId: "note-1", body: "first", author: "A", authorId: "a", createdAt: "2026-09-01T00:00:00.000Z" },
      { id: "c-2", noteId: "note-1", body: "second", author: "A", authorId: "a", createdAt: "2026-09-02T00:00:00.000Z" },
    );
    const order = (list: { id: string }[]) => list.map((c) => c.id);
    expect(order(await repo.comments("note-1"))).toEqual(["c-1", "c-2", "c-3"]);
    expect(order(await repo.comments("note-1"))).toEqual(["c-1", "c-2", "c-3"]);
  });
});
