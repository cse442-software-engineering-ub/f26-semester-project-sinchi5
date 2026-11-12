import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Users } from "lucide-react";
import type { Friend, FriendLists } from "../domain";
import { createHttpFriends } from "../services/friends-http";
import { Modal, PageHeading } from "../shared/ui";
import { FieldError } from "./account";
import s from "../app/App.module.css";

// Card 154: send classmates friend requests by email, answer the ones you get, and remove friends.
export function Friends() {
  const [api] = useState(() => createHttpFriends());
  const [lists, setLists] = useState<FriendLists>();
  const [pageError, setPageError] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Friend>();
  // Blocks a double click before React re-renders the disabled buttons.
  const pending = useRef(false);

  useEffect(() => {
    api.list().then(setLists, (e: Error) => setPageError(e.message));
  }, [api]);

  async function run(action: () => Promise<FriendLists>, onError: (message: string) => void) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    try {
      setLists(await action());
      return true;
    } catch (e) {
      onError((e as Error).message);
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    setEmailError("");
    setSent(false);
    if (await run(() => api.request(email.trim()), setEmailError)) {
      setEmail("");
      setSent(true);
    }
  }
  const answer = (friend: Friend, accept: boolean) => {
    setPageError("");
    void run(() => api.respond(friend.id, accept), setPageError);
  };
  const person = (friend: Friend) => (
    <span className={s.friendName}>
      <strong>{friend.name}</strong>
      <small>{friend.email}</small>
    </span>
  );

  return (
    <>
      <PageHeading title="Friends" description="Add the classmates you study with by email." />
      <div className={s.settingsGrid}>
        {pageError && <p className={s.error} role="alert">{pageError}</p>}
        <section className={s.panel} aria-labelledby="friend-add-heading">
          <div className={s.settingsHeading}>
            <h2 id="friend-add-heading">Add a classmate</h2>
            <p className={s.muted}>They’ll see your request the next time they open Friends.</p>
          </div>
          <form className={s.form} noValidate onSubmit={send} aria-busy={busy}>
            <label htmlFor="friend-email">Classmate's email</label>
            <input id="friend-email" type="email" autoComplete="off" value={email} disabled={busy}
              aria-invalid={!!emailError} aria-describedby={emailError ? "friend-email-error" : undefined}
              onChange={(e) => { setEmail(e.target.value); setEmailError(""); setSent(false); }} />
            <FieldError id="friend-email-error" message={emailError} />
            <button type="submit" className={s.primary} disabled={busy}>Send request</button>
            {sent && <p role="status">Request sent.</p>}
          </form>
        </section>
        {!!lists?.incoming.length && (
          <section className={s.panel} aria-labelledby="friend-incoming-heading">
            <div className={s.settingsHeading}><h2 id="friend-incoming-heading">Requests for you</h2></div>
            <ul className={s.settingRows}>
              {lists.incoming.map((friend) => (
                <li key={friend.id}>
                  {person(friend)}
                  <span className={s.actions}>
                    <button className={s.primary} disabled={busy} aria-label={`Accept ${friend.name}`}
                      onClick={() => answer(friend, true)}>Accept</button>
                    <button className={s.secondary} disabled={busy} aria-label={`Decline ${friend.name}`}
                      onClick={() => answer(friend, false)}>Decline</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!!lists?.outgoing.length && (
          <section className={s.panel} aria-labelledby="friend-outgoing-heading">
            <div className={s.settingsHeading}><h2 id="friend-outgoing-heading">Sent requests</h2></div>
            <ul className={s.settingRows}>
              {lists.outgoing.map((friend) => (
                <li key={friend.id}>
                  {person(friend)}
                  <span className={s.muted}>Pending</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className={s.panel} aria-labelledby="friend-list-heading">
          <div className={s.settingsHeading}><h2 id="friend-list-heading">Your friends</h2></div>
          {!lists ? (
            !pageError && <p role="status" className={s.muted}>Loading your friends…</p>
          ) : lists.friends.length ? (
            <ul className={s.settingRows}>
              {lists.friends.map((friend) => (
                <li key={friend.id}>
                  {person(friend)}
                  <button className={s.secondary} disabled={busy} aria-label={`Remove ${friend.name}`}
                    onClick={() => { setPageError(""); setRemoving(friend); }}>Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <div className={s.courseEmpty}>
              <Users size={22} aria-hidden="true" />
              <span>No friends yet. Add a classmate by email.</span>
            </div>
          )}
        </section>
      </div>
      {removing && (
        <RemoveFriendDialog friend={removing} onClose={() => setRemoving(undefined)}
          onRemove={async () => {
            setLists(await api.remove(removing.id));
            setRemoving(undefined);
          }} />
      )}
    </>
  );
}

function RemoveFriendDialog({ friend, onRemove, onClose }: {
  friend: Friend;
  // Resolves once the friend is gone; the caller then unmounts the dialog.
  onRemove: () => Promise<void>;
  onClose: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    if (removing) return;
    setRemoving(true);
    setError("");
    try {
      await onRemove();
    } catch (e) {
      setRemoving(false);
      setError((e as Error).message);
    }
  }
  return (
    <Modal title={`Remove ${friend.name} from your friends?`}
      description="You’ll also leave their friends list. You can send a new request later."
      dismissible={!removing} onClose={onClose}>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}>
        <Dialog.Close className={s.secondary} disabled={removing}>Cancel</Dialog.Close>
        <button className={s.danger} disabled={removing} onClick={() => void confirm()}>Remove friend</button>
      </div>
    </Modal>
  );
}
