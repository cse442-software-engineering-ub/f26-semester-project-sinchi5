import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_COMMENT_LENGTH, type Comment, type NoteRepository } from "../domain";
import { useHoldRefresh } from "../app/context";
import css from "./note-editor.module.css";
import s from "../shared/ui.module.css";
const both = { muted: `${s.muted} ${css.muted}` };

// Card 247: a shared note's comments from the server, oldest first. Anyone on the note may comment;
// the author or the note's owner may delete one.
export function Comments({ noteId, isOwner, userId, repository }: {
  noteId: string;
  isOwner: boolean;
  userId: string;
  repository: NoteRepository;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const pending = useRef(false);
  const active = useRef(true);
  useHoldRefresh(text !== "");

  useEffect(() => {
    active.current = true;
    setLoading(true);
    setLoadError("");
    repository.comments(noteId).then((items) => active.current && setComments(items))
      .catch((e: Error) => active.current && setLoadError(e.message))
      .finally(() => active.current && setLoading(false));
    return () => { active.current = false; };
  }, [noteId, repository, retry]);

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
  const post = (event: FormEvent) => {
    event.preventDefault();
    return run("post", async () => {
      const created = await repository.comment(noteId, text);
      setComments((items) => [...items, created]);
      setText("");
    });
  };
  const remove = (c: Comment) => run(`delete:${c.id}`, async () => {
    await repository.deleteComment(noteId, c.id);
    setComments((items) => items.filter((x) => x.id !== c.id));
  });
  const left = MAX_COMMENT_LENGTH - text.length;

  return (
    <>
      {loading ? <p role="status">Loading comments…</p> : loadError ? (
        <div role="alert" className={s.error}>
          {loadError}
          <button type="button" className={s.secondary} onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </div>
      ) : (
        <>
          {comments.map((c) => (
            <article key={c.id} className={css.comment}>
              <header className={css.commentHead}>
                <strong>{c.author}</strong>
                <time dateTime={c.createdAt}>{new Date(c.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>
              </header>
              <p>{c.body}</p>
              {(isOwner || c.authorId === userId) && (
                <button type="button" className={s.secondary} disabled={!!busy} aria-label={`Delete comment by ${c.author}`}
                  onClick={() => remove(c)}>Delete</button>
              )}
            </article>
          ))}
          {!comments.length && <p className={both.muted}>Be the first to add a thought.</p>}
        </>
      )}
      <form className={s.form} onSubmit={post}>
        <label>
          Add a comment
          <textarea rows={3} placeholder="Share a thought…" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <small className={`${both.muted} ${left < 100 ? css.commentLow : ""}`} aria-live="polite">
          {text.length.toLocaleString()} / {MAX_COMMENT_LENGTH.toLocaleString()}
        </small>
        {error && <p role="alert" className={s.error}>{error}</p>}
        <button className={s.primary} disabled={!text.trim() || left < 0 || !!busy}>
          {busy === "post" ? "Posting…" : "Post comment"}
        </button>
      </form>
    </>
  );
}
