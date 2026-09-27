import type { Collaborator, NoteRepository } from "../domain";

// Frontend fixture only. Task #73 will replace this with an HTTP adapter.
const registeredClassmates = [
  { id: "classmate-jamie", name: "Jamie", email: "jamie@example.edu" },
];

export function createMockCollaborators(): Pick<NoteRepository, "collaborators" | "inviteCollaborator"> {
  const invitations = new Map<string, Collaborator[]>();
  return {
    async collaborators(noteId) {
      return structuredClone(invitations.get(noteId) || []);
    },
    async inviteCollaborator(noteId, email) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const account = registeredClassmates.find((user) => user.email === email.trim().toLowerCase());
      if (!account) throw new Error("No registered account was found for this email.");
      const collaborator: Collaborator = { ...account, status: "Pending" };
      const current = invitations.get(noteId) || [];
      invitations.set(noteId, [...current.filter((entry) => entry.id !== collaborator.id), collaborator]);
      return { collaborator: { ...collaborator } };
    },
  };
}
