import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Users } from "lucide-react";
import type { Friend, FriendLists } from "../domain";
import { createHttpFriends } from "../services/friends-http";
import { Avatar, Modal, PageHeading } from "../shared/ui";
import { FieldError } from "./account";
import css from "./friends.module.css";
import s from "../shared/ui.module.css";

// Card 154: send classmates friend requests by email, answer the ones you get, and remove friends.
// Card 233: the add form and requests sit beside a grid of friend cards on wide screens.
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
    <>
      <Avatar user={{ id: friend.userId, name: friend.name, email: friend.email, hasPhoto: false }} className={css.avatar} />
      <span className={css.friendName}>
        <strong>{friend.name}</strong>
        <small>{friend.email}</small>
      </span>
    </>
  );
  const none = (text: string) => <p className={css.none}>{text}</p>;

  return (
    <div className={css.friends}>
      <PageHeading title="Friends" description="Add the classmates you study with by email." />
      {pageError && <p className={s.error} role="alert">{pageError}</p>}
      <div className={css.layout}>
        <div className={css.side}>
          <section className={css.card} aria-labelledby="friend-add-heading">
            <div className={css.head}>
              <h2 id="friend-add-heading">Add a classmate</h2>
              <p>They’ll see your request the next time they open Friends.</p>
            </div>
            <form className={s.form} noValidate onSubmit={send} aria-busy={busy}>
              <label htmlFor="friend-email">Classmate's email</label>
              <input id="friend-email" type="email" autoComplete="off" value={email} disabled={busy}
                aria-invalid={!!emailError} aria-describedby={emailError ? "friend-email-error" : undefined}
                onChange={(e) => { setEmail(e.target.value); setEmailError(""); setSent(false); }} />
              <FieldError id="friend-email-error" message={emailError} />
              <button type="submit" className={`${s.primary} ${css.tall}`} disabled={busy}>Send request</button>
              {sent && <p role="status">Request sent.</p>}
            </form>
          </section>
          <section className={css.card} aria-labelledby="friend-incoming-heading">
            <div className={css.head}><h2 id="friend-incoming-heading">Requests for you</h2></div>
            {!lists ? null : lists.incoming.length ? (
              <ul className={css.rows}>
                {lists.incoming.map((friend) => (
                  <li key={friend.id}>
                    {person(friend)}
                    <span className={`${s.actions} ${css.rowActions}`}>
                      <button className={s.primary} disabled={busy} aria-label={`Accept ${friend.name}`}
                        onClick={() => answer(friend, true)}>Accept</button>
                      <button className={s.secondary} disabled={busy} aria-label={`Decline ${friend.name}`}
                        onClick={() => answer(friend, false)}>Decline</button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : none("No requests waiting for you.")}
          </section>
          <section className={css.card} aria-labelledby="friend-outgoing-heading">
            <div className={css.head}><h2 id="friend-outgoing-heading">Sent requests</h2></div>
            {!lists ? null : lists.outgoing.length ? (
              <ul className={css.rows}>
                {lists.outgoing.map((friend) => (
                  <li key={friend.id}>
                    {person(friend)}
                    <span className={css.pending}>Pending</span>
                  </li>
                ))}
              </ul>
            ) : none("You have no pending requests.")}
          </section>
        </div>
        <section className={css.card} aria-labelledby="friend-list-heading">
          <div className={css.head}><h2 id="friend-list-heading">Your friends</h2></div>
          {!lists ? (
            !pageError && <p role="status" className={s.muted}>Loading your friends…</p>
          ) : lists.friends.length ? (
            <ul className={css.friendGrid}>
              {lists.friends.map((friend) => (
                <li key={friend.id} className={css.friendCard}>
                  <span className={css.who}>{person(friend)}</span>
                  <button className={s.secondary} disabled={busy} aria-label={`Remove ${friend.name}`}
                    onClick={() => { setPageError(""); setRemoving(friend); }}>Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <div className={css.courseEmpty}>
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
    </div>
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
