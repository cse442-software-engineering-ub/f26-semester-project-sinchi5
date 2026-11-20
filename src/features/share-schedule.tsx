import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Course, ScheduleShare } from "../domain";
import { createHttpScheduleShares } from "../services/schedule-shares-http";
import { Avatar, Modal } from "../shared/ui";
import { FieldError } from "./account";
import s from "../shared/ui.module.css";
import css from "./friends.module.css";
import own from "./share-schedule.module.css";

// Card 144: the owner shares one course's schedule, view only, with a classmate by email (routes from card 143).
export function ShareScheduleDialog({ course, onClose }: { course: Course; onClose: () => void }) {
  const [api] = useState(() => createHttpScheduleShares());
  const [shares, setShares] = useState<ScheduleShare[]>();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [listError, setListError] = useState("");
  const [busy, setBusy] = useState(false);
  // Blocks a double click or a second Enter before React re-renders the disabled button.
  const pending = useRef(false);

  useEffect(() => {
    api.list(course.id).then(setShares, (e: Error) => setListError(e.message));
  }, [api, course.id]);

  async function run(action: () => Promise<void>, onError: (message: string) => void) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function share(event: FormEvent) {
    event.preventDefault();
    setEmailError("");
    void run(async () => {
      const added = await api.share(course.id, email);
      setShares((current) => [...(current ?? []).filter((x) => x.userId !== added.userId), added]
        .sort((a, b) => a.name.localeCompare(b.name)));
      setEmail("");
    }, setEmailError);
  }
  function stop(share: ScheduleShare) {
    setListError("");
    void run(async () => setShares(await api.unshare(course.id, share.userId)), setListError);
  }

  return (
    <Modal title="Share this schedule"
      description={`Classmates you add see ${course.code} and its events in their schedule. They can’t change them.`}
      dismissible={!busy} onClose={onClose}>
      <form className={s.form} noValidate onSubmit={share} aria-busy={busy}>
        <label htmlFor="schedule-share-email">Classmate's email</label>
        <input id="schedule-share-email" type="email" autoComplete="off" value={email} disabled={busy}
          aria-invalid={!!emailError} aria-describedby={emailError ? "schedule-share-email-error" : undefined}
          onChange={(e) => { setEmail(e.target.value); setEmailError(""); }} />
        <FieldError id="schedule-share-email-error" message={emailError} />
        <button type="submit" className={`${s.primary} ${css.tall}`} disabled={busy}>Share</button>
      </form>
      <section className={own.sharedWith} aria-labelledby="schedule-shared-with">
        <h3 id="schedule-shared-with">Shared with</h3>
        {listError && <p className={s.error} role="alert">{listError}</p>}
        {!shares ? (
          !listError && <p role="status" className={s.muted}>Loading who can see it…</p>
        ) : shares.length ? (
          <ul className={css.rows}>
            {shares.map((share) => (
              <li key={share.userId}>
                <Avatar user={{ id: share.userId, name: share.name, email: share.email, hasPhoto: false }} className={css.avatar} />
                <span className={`${css.friendName} ${own.person}`}>
                  <strong>{share.name}</strong>
                  <small>{share.email}</small>
                </span>
                <span className={css.pending}>Can view</span>
                <span className={`${s.actions} ${css.rowActions}`}>
                  <button type="button" className={s.secondary} disabled={busy} aria-label={`Stop sharing with ${share.name}`}
                    onClick={() => stop(share)}>Stop sharing</button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={css.none}>Not shared with anyone yet.</p>
        )}
      </section>
    </Modal>
  );
}
