import { describe, expect, it, vi } from "vitest";
import { createMockCollaborators } from "./collaborators.mock";

describe("frontend invitation mock contract", () => {
  it("returns a registered classmate once, scoped to the note, without persistent storage", async () => {
    const repo = createMockCollaborators();
    const response = await repo.inviteCollaborator("note-a", " Jamie@Example.edu ");
    expect(response.collaborator).toEqual({ id: "classmate-jamie", name: "Jamie", email: "jamie@example.edu", status: "Pending" });
    await repo.inviteCollaborator("note-a", "jamie@example.edu");
    expect(await repo.collaborators("note-a")).toHaveLength(1);
    expect(await repo.collaborators("note-b")).toEqual([]);
    expect(await createMockCollaborators().collaborators("note-a")).toEqual([]);
    response.collaborator.name = "Changed";
    expect((await repo.collaborators("note-a"))[0].name).toBe("Jamie");
  });
  it("rejects an unregistered account without adding a row and allows retry", async () => {
    const repo = createMockCollaborators();
    await expect(repo.inviteCollaborator("note-a", "unknown@example.edu")).rejects.toThrow("No registered account was found for this email.");
    expect(await repo.collaborators("note-a")).toEqual([]);
    await repo.inviteCollaborator("note-a", "jamie@example.edu");
    expect(await repo.collaborators("note-a")).toHaveLength(1);
  });
  it("keeps the invitation pending until the simulated response arrives", async () => {
    vi.useFakeTimers();
    try {
      const repo = createMockCollaborators();
      const pending = repo.inviteCollaborator("note-a", "jamie@example.edu");
      expect(await repo.collaborators("note-a")).toEqual([]);
      await vi.advanceTimersByTimeAsync(400);
      await pending;
      expect(await repo.collaborators("note-a")).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });
});
