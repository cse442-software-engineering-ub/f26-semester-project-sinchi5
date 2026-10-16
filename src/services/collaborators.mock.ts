import type { Collaborator, NoteRepository } from "../domain";

// Frontend fixture only. Task #73 will replace this with an HTTP adapter.
const registeredClassmates = [
  { id: "classmate-jamie", name: "Jamie", email: "jamie@example.edu" },
];

// The repository passes its own map so deleting a note can drop its invitations.
export function createMockCollaborators(
  invitations = new Map<string, Collaborator[]>(),
): Pick<NoteRepository, "collaborators" | "inviteCollaborator" | "setCollaboratorPermission"> {
  return {
    async collaborators(noteId) {
      return structuredClone(invitations.get(noteId) || []);
    },
    async inviteCollaborator(noteId, email) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const account = registeredClassmates.find((user) => user.email === email.trim().toLowerCase());
      if (!account) throw new Error("No registered account was found for this email.");
      const collaborator: Collaborator = { ...account, status: "Pending", permission: "view",};
      const current = invitations.get(noteId) || [];
      invitations.set(noteId, [...current.filter((entry) => entry.id !== collaborator.id), collaborator]);
      return { collaborator: { ...collaborator } };
    },
     async setCollaboratorPermission(noteId, collaboratorId, permission) {
      const current = invitations.get(noteId) || [];
      const collaborator = current.find( (entry) => entry.id === collaboratorId,);
      if (!collaborator) {throw new Error("Collaborator not found.");}
      const updated: Collaborator = {...collaborator,permission,};
      invitations.set(noteId,current.map((entry) =>entry.id === collaboratorId ? updated : entry,),);
      return structuredClone(updated);
    },
  };
}
