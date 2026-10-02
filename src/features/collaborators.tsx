import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { Collaborator, NoteRepository } from "../domain";
import { Modal } from "../shared/ui";
import s from "../app/App.module.css";

export function Collaborators({ noteId, isOwner, repository }: {
  noteId: string;
  isOwner: boolean;
  repository: NoteRepository;
}) {
  const [entries, setEntries] = useState<Collaborator[]>([]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState("");
  const [changingPermission, setChangingPermission] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState("");
  const pending = useRef(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    let mounted = true;
    repository.collaborators(noteId).then((items) => {
      if (mounted) setEntries(unique(items));
    }).catch(() => {
      if (mounted) setListError("Could not load collaborators. Reopen the note to try again.");
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; active.current = false; };
  }, [noteId, repository]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const input = event.currentTarget.elements.namedItem("email") as HTMLInputElement;
    if (!input.validity.valid) {
      setError("Enter a valid email address.");
      input.focus();
      return;
    }
    pending.current = true;
    setSending(true);
    setError("");
    try {
      const { collaborator } = await repository.inviteCollaborator(noteId, email.trim());
      if (!active.current) return;
      setEntries((items) => unique([...items, collaborator]));
      setSuccess(`Invitation sent to ${collaborator.name}.`);
      setOpen(false);
    } catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : "Could not send the invitation. Please try again.");
    } finally {
      pending.current = false;
      if (active.current) setSending(false);
    }
  }

  async function changePermission(
    collaboratorId: string,
    permission: "view" | "edit",
  ) {
    setChangingPermission(collaboratorId);
    setPermissionError("");

    try {
      const updated = await repository.setCollaboratorPermission(
        noteId,
        collaboratorId,
        permission,
      );

      if (!active.current) return;

      setEntries((items) =>
        items.map((entry) =>
          entry.id === collaboratorId ? updated : entry,
        ),
      );
    } catch (failure) {
      if (active.current) {
        setPermissionError(
          failure instanceof Error
            ? failure.message
            : "Could not update collaborator permission.",
        );
      }
    } finally {
      if (active.current) {
        setChangingPermission(null);
      }
    }
  }

  return (
    <section aria-label="Collaborators" className={s.collaborators}>
      <h3>Collaborators</h3>
      {loading && <p role="status">Loading collaborators...</p>}
      {listError && <p role="alert" className={s.error}>{listError}</p>}
      {!loading && !listError && !entries.length && <p className={s.muted}>No collaborators yet.</p>}
    <ul className={s.collaboratorList}>
      {entries.map((entry) => (
        <li key={entry.id}>
          <strong>{entry.name}</strong>
          <span>{entry.email}</span>
          {entry.status && <small>{entry.status}</small>}

          {isOwner ? (
            <label>
              Permission
              <select
                aria-label={`Permission for ${entry.name}`}
                value={entry.permission}
                disabled={changingPermission === entry.id}
                onChange={(event) =>
                  changePermission(
                    entry.id,
                    event.target.value as "view" | "edit",
                  )
                }
              >
                <option value="edit">Can edit</option>
                <option value="view">Can view</option>
              </select>
            </label>
          ) : (
            <small>
              {entry.permission === "edit" ? "Can edit" : "Can view"}
            </small>
          )}
        </li>
      ))}
    </ul>

    {permissionError && (
      <p role="alert" className={s.error}>
        {permissionError}
      </p>
    )}
      {success && <p role="status">{success}</p>}
      {isOwner && <button className={s.secondary} disabled={loading || !!listError || sending} onClick={() => {
        setEmail(""); setError(""); setSuccess(""); setOpen(true);
      }}>Invite collaborator</button>}
      {open && <Modal title="Invite collaborator" description="Invite a registered classmate by email." onClose={() => setOpen(false)} dismissible={!sending}>
        <form className={s.form} noValidate onSubmit={invite} aria-busy={sending}>
          <label htmlFor="collaborator-email">Classmate's email</label>
          <input id="collaborator-email" name="email" type="email" required autoComplete="email"
            value={email} disabled={sending} aria-invalid={!!error} aria-describedby={error ? "invite-error" : undefined}
            onChange={(event) => { setEmail(event.target.value); setError(""); }} />
          {error && <p id="invite-error" role="alert" className={s.error}>{error}</p>}
          {sending && <p role="status">Sending invitation...</p>}
          <div className={s.actions}>
            <Dialog.Close className={s.secondary} disabled={sending}>Cancel</Dialog.Close>
            <button type="submit" className={s.primary} disabled={sending}>{sending ? "Sending..." : "Send invitation"}</button>
          </div>
        </form>
      </Modal>}
    </section>
  );
}

function unique(entries: Collaborator[]) {
  return entries.filter((entry, index) => entries.findIndex((other) =>
    other.id === entry.id || other.email.trim().toLowerCase() === entry.email.trim().toLowerCase(),
  ) === index);
}
