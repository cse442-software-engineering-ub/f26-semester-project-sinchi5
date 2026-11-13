import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Link } from "react-router-dom";
import type { Course, CourseShare, Friend } from "../domain";
import { createHttpFriends } from "../services/friends-http";
import { createHttpNoteShares } from "../services/note-shares-http";
import { Modal } from "../shared/ui";
import s from "../app/App.module.css";

// Card 157: "Shared with Ana and Bea" under the course, or "Not shared with any friends.".
export function sharedLabel(shares: CourseShare[]) {
  if (!shares.length) return "Not shared with any friends.";
  const names = shares.map((share) => share.name);
  return `Shared with ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]}`;
}

// Card 157: choose which friends can read this course's notes (card 156 keeps them read only).
export function ShareNotesDialog({ course, shares, onSaved, onClose }: {
  course: Course;
  shares: CourseShare[];
  onSaved: (shares: CourseShare[]) => void;
  onClose: () => void;
}) {
  const [api] = useState(() => ({ friends: createHttpFriends(), shares: createHttpNoteShares() }));
  const [friends, setFriends] = useState<Friend[]>();
  const [chosen, setChosen] = useState(() => new Set(shares.map((share) => share.userId)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Blocks a double click before React re-renders the disabled button.
  const pending = useRef(false);

  useEffect(() => {
    api.friends.list().then((lists) => setFriends(lists.friends), (e: Error) => setError(e.message));
  }, [api]);

  function toggle(userId: string, checked: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }
  async function save() {
    if (pending.current || !friends) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      // Only people still in the friends list are sent, in the order the list shows them.
      onSaved(await api.shares.share(course.id, course.code, friends.filter((f) => chosen.has(f.userId)).map((f) => f.userId)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal title={`Share your ${course.code} notes`}
      description="Friends you choose can read every note in this course, including ones you add later. They can’t change them."
      dismissible={!saving} onClose={onClose}>
      {error && <p className={s.error} role="alert">{error}</p>}
      {!friends ? (
        !error && <p role="status" className={s.muted}>Loading your friends…</p>
      ) : friends.length ? (
        <fieldset className={s.shareFriends} disabled={saving}>
          <legend className={s.srOnly}>Friends</legend>
          {friends.map((friend) => (
            <label key={friend.userId} className={`${s.checkLabel} ${s.shareFriend}`}>
              <input type="checkbox" checked={chosen.has(friend.userId)}
                onChange={(e) => toggle(friend.userId, e.target.checked)} />
              <span className={s.friendName}>
                <strong>{friend.name}</strong>
                <small>{friend.email}</small>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className={s.courseEmpty}>
          <span>Add friends first to share your notes.</span>
          <Link className={s.textLink} to="/friends" onClick={onClose}>Go to Friends</Link>
        </p>
      )}
      <div className={s.actions}>
        <Dialog.Close className={s.secondary} disabled={saving}>Cancel</Dialog.Close>
        {!!friends?.length && (
          <button className={s.primary} disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </Modal>
  );
}
