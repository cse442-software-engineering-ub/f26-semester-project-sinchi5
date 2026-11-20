import { useEffect, useRef, useState } from "react";
import type { Collaborator, CollaboratorPermission, Friend, NoteRepository } from "../domain";
import { createHttpFriends } from "../services/friends-http";
import css from "./note-editor.module.css";
import s from "../shared/ui.module.css";
// Shared classes this screen's own rules also name (see note-editor.module.css), applied together.
const both = { muted: `${s.muted} ${css.muted}` };

// Card 247: the note's collaborators from the server. The owner invites accepted friends and manages
// permissions; a collaborator sees who else is in and can leave. Nothing here is typed as an email.
export function Collaborators({ noteId, isOwner, userId, repository, onLeft }: {
  noteId: string;
  isOwner: boolean;
  userId: string;
  repository: NoteRepository;
  onLeft: () => void;
}) {
  const [entries, setEntries] = useState<Collaborator[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pick, setPick] = useState("");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const pending = useRef(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    repository.collaborators(noteId).then((items) => active.current && setEntries(items))
      .catch((e: Error) => active.current && setListError(e.message || "Could not load collaborators. Reopen the note to try again."))
      .finally(() => active.current && setLoading(false));
    if (isOwner) createHttpFriends().list().then((lists) => active.current && setFriends(lists.friends)).catch(() => {});
    return () => { active.current = false; };
  }, [noteId, repository, isOwner]);

  // One request at a time; `key` names the control that is waiting.
  async function run(key: string, action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(key);
    setError("");
    try { await action(); } catch (e) { if (active.current) setError((e as Error).message); } finally {
      pending.current = false;
      if (active.current) setBusy("");
    }
  }
  const invitable = friends.filter((f) => !entries.some((e) => e.id === f.userId));
  const invite = () => run("invite", async () => {
    const friend = invitable.find((f) => f.userId === pick);
    if (!friend) return;
    const { collaborator } = await repository.inviteCollaborator(noteId, friend.email);
    setEntries((items) => [...items.filter((e) => e.id !== collaborator.id), collaborator]);
    setPick("");
  });
  const setPermission = (entry: Collaborator, permission: CollaboratorPermission) => run(`perm:${entry.id}`, async () => {
    const updated = await repository.setCollaboratorPermission(noteId, entry.id, permission);
    setEntries((items) => items.map((e) => (e.id === entry.id ? updated : e)));
  });
  const remove = (entry: Collaborator) => run(`remove:${entry.id}`, async () => {
    await repository.removeCollaborator(noteId, entry.id);
    if (entry.id === userId) return onLeft();
    setEntries((items) => items.filter((e) => e.id !== entry.id));
  });

  return (
    <section aria-label="Collaborators" className={css.collaborators}>
      <h3>Collaborators</h3>
      {loading && <p role="status">Loading collaborators…</p>}
      {listError && <p role="alert" className={s.error}>{listError}</p>}
      {!loading && !listError && !entries.length && <p className={both.muted}>No collaborators yet.</p>}
      <ul className={css.collaboratorList}>
        {entries.map((entry) => (
          <li key={entry.id}>
            <span className={css.person}>
              <strong>{entry.name}</strong>
              <span className={css.personEmail}>{entry.email}</span>
            </span>
            <span className={css.personActions}>
              {isOwner ? (
                <select aria-label={`Permission for ${entry.name}`} value={entry.permission} disabled={!!busy}
                  onChange={(e) => setPermission(entry, e.target.value as CollaboratorPermission)}>
                  <option value="edit">Can edit</option>
                  <option value="view">Can view</option>
                </select>
              ) : (
                <small>{entry.permission === "edit" ? "Can edit" : "Can view"}</small>
              )}
              {isOwner && <button type="button" className={s.secondary} disabled={!!busy}
                aria-label={`Remove ${entry.name}`} onClick={() => remove(entry)}>Remove</button>}
              {!isOwner && entry.id === userId && <button type="button" className={s.secondary} disabled={!!busy}
                onClick={() => remove(entry)}>Leave this note</button>}
            </span>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className={s.error}>{error}</p>}
      {isOwner && !loading && (invitable.length ? (
        <div className={css.invite}>
          <label htmlFor="invite-friend">Invite a friend</label>
          <span className={css.inviteRow}>
            <select id="invite-friend" value={pick} disabled={!!busy} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose a friend</option>
              {invitable.map((f) => <option key={f.userId} value={f.userId}>{f.name}</option>)}
            </select>
            <button type="button" className={s.secondary} disabled={!pick || !!busy} onClick={invite}>
              {busy === "invite" ? "Inviting…" : "Invite"}
            </button>
          </span>
        </div>
      ) : (
        <p className={both.muted}>{friends.length ? "Every friend is already on this note." : "Add a friend to share this note with them."}</p>
      ))}
    </section>
  );
}
