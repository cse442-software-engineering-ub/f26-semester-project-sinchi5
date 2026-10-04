import { useEffect, useRef, useState } from "react";
import {
  useParams,
  useSearchParams,
  Link,
} from "react-router-dom";
import {
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Plus,
  ArrowLeft,
  History,
  MessageCircle,
  Check,
  Pin,
  X,
} from "lucide-react";
import { useApp } from "../app/context";
import { PageHeading, NoteCard, Empty, Modal, EventRow } from "../shared/ui";
import { MAX_COMMENT_LENGTH } from "../domain";
import type {
  Note,
  NoteVersion,
  Comment,
  CommentScenario,
  Collaborator,
} from "../domain";
import s from "../app/App.module.css";
import { Collaborators } from "./collaborators";
export function Notes() {
  const { repo, state, refresh } = useApp();
  const [params, setParams] = useSearchParams();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [createStatus, setCreateStatus] = useState("All changes saved");
  const key = params.toString();
  useEffect(() => {
    let active = true;
    setLoading(true);
    repo.notes
      .list(Object.fromEntries(params))
      .then((n) => {
        if (active) {
          setNotes(n);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [key, state.notes, repo]);
  const set = (k: string, v: string) =>
    setParams(
      (p) => {
        v ? p.set(k, v) : p.delete(k);
        return p;
      },
      { replace: true },
    );
  
  useEffect(() => {
    if (!creating) return;

    if (!draftTitle.trim() && !draftBody.trim()) {
      setCreateStatus("All changes saved");
      return;
    }

    setCreateStatus("Saving...");

    const timer = setTimeout(() => {
      // Task #105 allows mocked note responses. Keep the draft in the
      // editor until the user leaves the dialog; closeCreateNote then
      // creates the real repository note so its card can be opened.
      setCreateStatus("All changes saved");
    }, 600);

    return () => clearTimeout(timer);
  }, [creating, draftTitle, draftBody]);

  function resetCreateNote() {
    setDraftTitle("");
    setDraftBody("");
    setCreateStatus("All changes saved");
    setCreating(false);
  }

  function openCreateNote() {
    setDraftTitle("");
    setDraftBody("");
    setCreateStatus("All changes saved");
    setCreating(true);
  }

  function cancelCreateNote() {
    // Nothing has been created in the repository yet, so Cancel can
    // safely discard the draft without needing note-delete behavior.
    resetCreateNote();
  }

  async function closeCreateNote() {
    const title = draftTitle.trim();
    const body = draftBody;

    if (!title && !body.trim()) {
      resetCreateNote();
      return;
    }

    setCreateStatus("Saving...");
    try {
      await repo.notes.create({
        title: title || "Untitled note",
        body,
      });
      await refresh();
      setError("");
      resetCreateNote();
    } catch (e) {
      setError((e as Error).message);
      setCreateStatus("Not saved");
      setCreating(false);
    }
  }

  const active = ["course", "category", "visibility", "from", "to"].filter(
    (k) => params.get(k),
  );
  return (
    <>
      <PageHeading
        eyebrow="Good ideas live here"
        title="Your notes"
        description="A place for every thought, and every thought in its place."
        actions={
          <button
            className={s.primary}
            onClick={openCreateNote}
          >
            <Plus size={18} /> Create Note
          </button>   
        }
      />
      {creating && (
        <Modal
          title="Create Note"
          description="Start writing. Your note saves automatically."
          onClose={closeCreateNote}
        >
          <div className={s.form}>
            <label>
              Note title
              <input
                aria-label="Note title"
                placeholder="Untitled note"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                autoFocus
              />
            </label>

            <label>
              Note content
              <textarea
                aria-label="Note content"
                rows={10}
                placeholder="Start writing..."
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
              />
            </label>

            <p role="status" className={s.muted}>
              {createStatus}
            </p>

            <div className={s.actions}>
              <button
                type="button"
                className={s.secondary}
                onClick={cancelCreateNote}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
      <div className={s.libraryToolbar}>
        <label className={s.search}>
          <Search size={18} />
          <input
            aria-label="Search notes"
            placeholder="Find a thought, a topic, a little inspiration…"
            value={params.get("q") || ""}
            onChange={(e) => set("q", e.target.value)}
          />
        </label>
        <button
          className={`${s.secondary} ${filters ? s.activeButton : ""}`}
          onClick={() => setFilters(!filters)}
          aria-expanded={filters}
        >
          <SlidersHorizontal size={16} /> Filters{" "}
          {active.length > 0 && `(${active.length})`}
        </button>
        <select
          aria-label="Sort notes"
          value={params.get("sort") || "modified"}
          onChange={(e) => set("sort", e.target.value)}
        >
          <option value="modified">Last modified</option>
          <option value="created">Date created</option>
          <option value="title">Alphabetical</option>
        </select>
        <div className={s.segment}>
          <button
            className={params.get("view") !== "list" ? s.activeButton : ""}
            aria-label="Grid view"
            aria-pressed={params.get("view") !== "list"}
            onClick={() => set("view", "grid")}
          >
            <LayoutGrid size={17} />
          </button>
          <button
            className={params.get("view") === "list" ? s.activeButton : ""}
            aria-label="List view"
            aria-pressed={params.get("view") === "list"}
            onClick={() => set("view", "list")}
          >
            <List size={18} />
          </button>
        </div>
      </div>
      {filters && (
        <div className={s.filters}>
          <label>
            Course
            <select
              value={params.get("course") || ""}
              onChange={(e) => set("course", e.target.value)}
            >
              <option value="">All courses</option>
              {state.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              value={params.get("category") || ""}
              onChange={(e) => set("category", e.target.value)}
            >
              <option value="">All categories</option>
              {["School", "Work", "Meetings", "Personal"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Visibility
            <select
              value={params.get("visibility") || ""}
              onChange={(e) => set("visibility", e.target.value)}
            >
              <option value="">All notes</option>
              <option value="private">Private</option>
              <option value="shared">Shared</option>
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={params.get("from") || ""}
              onChange={(e) => set("from", e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              min={params.get("from") || undefined}
              value={params.get("to") || ""}
              onChange={(e) => set("to", e.target.value)}
            />
          </label>
        </div>
      )}
      <div className={s.libraryMeta}>
        <span>{notes.length} notes in your space</span>
        <div className={s.actions}>
          {active.map((k) => (
            <button className={s.chip} key={k} onClick={() => set(k, "")}>
              {state.courses.find((c) => c.id === params.get(k))?.code ||
                params.get(k)}{" "}
              <X size={12} />
            </button>
          ))}
          {(active.length > 0 || params.get("q")) && (
            <button className={s.textLink} onClick={() => setParams({})}>
              Clear all
            </button>
          )}
        </div>
      </div>
      {error ? (
        <p role="alert" className={s.error}>
          {error}
        </p>
      ) : loading ? (
        <p role="status">Gathering your notes…</p>
      ) : notes.length ? (
        <div
          className={`${s.noteGrid} ${params.get("view") === "list" ? s.noteList : ""}`}
        >
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </div>
      ) : (
        <Empty title="No notes found">
          Try another keyword or clear a filter to find your way back.
        </Empty>
      )}
    </>
  );
}
export function NoteWorkspace() {
  const { id = "" } = useParams();
  const { repo, state, refresh } = useApp();
  const [note, setNote] = useState<Note>();
  const [status, setStatus] = useState("All changes saved");
  const [error, setError] = useState("");
  const [panel, setPanel] = useState("comments");
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState("");
  const [commentScenario, setCommentScenario] = useState<CommentScenario>("success");
  const [commentsRetry, setCommentsRetry] = useState(0);
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const postingRef = useRef(false);
  const [postError, setPostError] = useState("");
  const [postScenario, setPostScenario] = useState<CommentScenario>("success");
  const [preview, setPreview] = useState<NoteVersion>();
  const [restore, setRestore] = useState(false);
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const pendingSave = useRef<Promise<Note>>();
  const [dirty, setDirty] = useState(false);
  const [pinning, setPinning] = useState(false);
  const noteRef = useRef<Note>();
  const dirtyRef = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    setNote(undefined);
    noteRef.current = undefined;
    dirtyRef.current = false;
    setDirty(false);
    setDraftBody("");
    setStatus("All changes saved");
    generation.current++;
    setError("");
    Promise.all([
      repo.notes.get(id),
      repo.notes.versions(id),
      repo.notes.collaborators(id),
    ])
      .then(([n, v, collaborators]) => {
        if (active) {
          setNote(n);
          setDraftBody(n.body);
          noteRef.current = n;
          setVersions(v);
          setCollaborators(collaborators);
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [id, repo]);
  useEffect(() => {
    let active = true;
    setCommentsLoading(true);
    setCommentsError("");
    repo.notes
      .comments(id, commentScenario)
      .then((c) => active && setComments(c))
      .catch((e) => active && setCommentsError((e as Error).message))
      .finally(() => active && setCommentsLoading(false));
    return () => {
      active = false;
    };
  }, [id, repo, commentScenario, commentsRetry]);
  useEffect(() => {
    if (!dirty || !note || saving) return;
    const current = ++generation.current;
    const timer = setTimeout(async () => {
      try {
        pendingSave.current = repo.notes.save(note);
        await pendingSave.current;
        if (current === generation.current) {
          dirtyRef.current = false;
          setDirty(false);
          setStatus("All changes saved");
          setVersions(await repo.notes.versions(id));
          await refresh();
        }
      } catch (e) {
        setError((e as Error).message);
        setStatus("Not saved");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [note, dirty, saving]);
  useEffect(() => {
    const save = () => {
      if (noteRef.current && dirtyRef.current && !savingRef.current) {
        void repo.notes
          .save(noteRef.current)
          .then(() => {
            dirtyRef.current = false;
            return refresh();
          })
          .catch((e) => setError(e.message));
      }
    };
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [id, repo]);
  // note.body always holds the persisted baseline; only draftBody contains typing.
  function edit(patch: Partial<Note>) {
    if (!note || !canEdit || savingRef.current) return;
    const n = { ...note, ...patch };
    noteRef.current = n;
    dirtyRef.current = true;
    setNote(n);
    setDirty(true);
    setStatus("Saving…");
  }
  async function saveBody() {
    if (!noteRef.current || !canEdit || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    setStatus("Saving…");
    generation.current++;
    try {
      // Finish any metadata save before submitting the body, so an older
      // autosave cannot overwrite the explicitly saved content.
      await pendingSave.current?.catch(() => undefined);
      const saved = await repo.notes.save({ ...noteRef.current!, body: draftBody });
      noteRef.current = saved;
      setNote(saved);
      setDraftBody(saved.body);
      dirtyRef.current = false;
      setDirty(false);
      setStatus("All changes saved");
    } catch (e) {
      setError("Changes could not be saved. Please try again. " + (e as Error).message);
      setStatus("Not saved");
      return;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    // A refresh failure must not report a successfully persisted body as lost.
    try {
      setVersions(await repo.notes.versions(id));
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function togglePin() {
    if (!noteRef.current || pinning) return;
    setPinning(true);
    try {
      const saved = await repo.notes.setPinned(id, !noteRef.current.pinned);
      // Keep any pending editor changes when updating the persisted pin state.
      const next = { ...noteRef.current!, pinned: saved.pinned };
      noteRef.current = next;
      setNote(next);
      setError("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPinning(false);
    }
  }
  if (error && !note)
    return (
      <Empty title="We couldn’t open that note">
        {error} <Link to="/notes">Back to notes</Link>
      </Empty>
    );
  if (!note) return <p role="status">Opening your note…</p>;
  const currentEmail = state.user?.email.trim().toLowerCase();

  const currentCollaborator = collaborators.find(
    (entry) => entry.email.trim().toLowerCase() === currentEmail,
  );

  const isOwner =
    !!state.user &&
    !currentCollaborator &&
    note.ownerId === state.user.id;

  const canEdit =
    !state.user ||
    isOwner ||
    currentCollaborator?.permission === "edit";
  return (
    <>
      <div className={s.editorTop}>
        <Link className={s.textLink} to="/notes">
          <ArrowLeft size={16} /> All notes
        </Link>
        <span role="status" className={s.muted}>
          <Check size={14} /> {saving ? "Saving…" : draftBody !== note.body ? "Unsaved body changes" : status}
        </span>
        <button
          className={note.pinned ? s.primary : s.secondary}
          aria-label={note.pinned ? "Unpin note" : "Pin note"}
          aria-pressed={Boolean(note.pinned)}
          disabled={pinning || !canEdit || saving}
          onClick={togglePin}
        >
          <Pin size={18} aria-hidden="true" />
          {note.pinned ? "Unpin" : "Pin"}
        </button>
      </div>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      <div className={s.editorLayout}>
        <section className={s.editor}>
          <span className={s.eyebrow}>Your ideas, unfolding</span>
          <input
            className={s.noteTitle}
            aria-label="Note title"
            value={note.title}
            disabled={!canEdit || saving}
            onChange={(e) => edit({ title: e.target.value })}
          />
          <div className={s.noteMetadata}>
            <label>
              Course
              <select
                value={note.courseId}
                disabled={!canEdit || saving}
                onChange={(e) => edit({ courseId: e.target.value })}
              >
                <option value="">No course</option>
                {state.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Lecture date
              <input
                type="date"
                value={note.lectureDate}
                disabled={!canEdit || saving}
                onChange={(e) => edit({ lectureDate: e.target.value })}
              />
            </label>
            <label>
              Category
              <select
                value={note.category}
                disabled={!canEdit || saving}
                onChange={(e) => edit({ category: e.target.value })}
              >
                {["School", "Work", "Meetings", "Personal"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Visibility
              <select
                value={note.visibility}
                disabled={!canEdit || saving}
                onChange={(e) =>
                  edit({ visibility: e.target.value as Note["visibility"] })
                }
              >
                <option value="private">Private</option>
                <option value="shared">Shared</option>
              </select>
            </label>
          </div>
          <label className={s.tagsLabel}>
            Tags
            <input
              placeholder="Add tags, separated by commas"
              value={note.tags.join(", ")}
              disabled={!canEdit || saving}
              onChange={(e) =>
                edit({
                  tags: e.target.value.split(",").map((t) => t.trimStart()),
                })
              }
            />
          </label>
          <textarea
            className={s.noteBody}
            aria-label="Note body"
            placeholder="Start anywhere. This space is yours…"
            value={draftBody}
            disabled={!canEdit || saving}
            onChange={(e) => setDraftBody(e.target.value)}
          />
          <div className={s.actions}>
            <button type="button" className={s.primary}
              disabled={!canEdit || saving || pinning || draftBody === note.body}
              onClick={saveBody}>{saving ? "Saving…" : "Save"}</button>
            <button type="button" className={s.secondary}
              disabled={!canEdit || saving || draftBody === note.body}
              onClick={() => { setDraftBody(note.body); setError(""); }}>
              Cancel
            </button>
          </div>
        </section>
        <aside className={s.inspector}>
          <Collaborators
            key={`${note.id}:${state.user?.id || ""}`}
            noteId={note.id}
            isOwner={isOwner}
            repository={repo.notes}
          />
          <div className={s.segment}>
            <button
              className={panel === "comments" ? s.activeButton : ""}
              onClick={() => setPanel("comments")}
            >
              <MessageCircle size={16} /> Comments
            </button>
            <button
              className={panel === "history" ? s.activeButton : ""}
              onClick={() => setPanel("history")}
            >
              <History size={16} /> History
            </button>
          </div>
          {panel === "comments" ? (
            note.visibility === "private" ? (
              <Empty title="Just for you">
                Make this note shared to start a conversation.
              </Empty>
            ) : (
              <>
                <h3>Better, together.</h3>
                <details className={s.demoDetails}>
                  <summary>Prototype preview options</summary>
                  <p>Comments load from this device. Choose how the load behaves.</p>
                  <label>
                    Comment loading
                    <select
                      value={commentScenario}
                      onChange={(e) =>
                        setCommentScenario(e.target.value as CommentScenario)
                      }
                    >
                      <option value="success">Loads normally</option>
                      <option value="slow">Loads slowly</option>
                      <option value="failure">Fails to load</option>
                    </select>
                  </label>
                  <label>
                    Comment posting
                    <select
                      value={postScenario}
                      onChange={(e) =>
                        setPostScenario(e.target.value as CommentScenario)
                      }
                    >
                      <option value="success">Posts normally</option>
                      <option value="slow">Posts slowly</option>
                      <option value="failure">Fails to post</option>
                    </select>
                  </label>
                </details>
                {commentsLoading ? (
                  <p role="status">Loading comments…</p>
                ) : commentsError ? (
                  <div role="alert" className={s.error}>
                    {commentsError}
                    <button
                      className={s.secondary}
                      onClick={() => setCommentsRetry((n) => n + 1)}
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <>
                    {comments.map((c) => (
                      <article key={c.id} className={s.comment}>
                        <strong>{c.author}</strong>
                        <small>{new Date(c.createdAt).toLocaleDateString()}</small>
                        <p>{c.body}</p>
                      </article>
                    ))}
                    {!comments.length && (
                      <p className={s.muted}>Be the first to add a thought.</p>
                    )}
                  </>
                )}
                <form
                  className={s.form}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (postingRef.current || note.visibility !== "shared")
                      return;
                    postingRef.current = true;
                    setPosting(true);
                    setPostError("");
                    try {
                      await repo.notes.comment(id, comment, postScenario);
                      setComment("");
                      setCommentsRetry((n) => n + 1);
                    } catch (e) {
                      setPostError((e as Error).message);
                    } finally {
                      postingRef.current = false;
                      setPosting(false);
                    }
                  }}
                >
                  <label>
                    Add a comment
                    <textarea
                      required
                      rows={3}
                      placeholder="Share a thought…"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </label>
                  <small className={s.muted}>
                    {comment.length.toLocaleString()} / {MAX_COMMENT_LENGTH.toLocaleString()}
                  </small>
                  {postError && (
                    <p role="alert" className={s.error}>
                      {postError}
                    </p>
                  )}
                  <button
                    disabled={
                      !comment.trim() ||
                      comment.length > MAX_COMMENT_LENGTH ||
                      posting
                    }
                    className={s.primary}
                  >
                    {posting ? "Posting…" : "Post comment"}
                  </button>
                </form>
              </>
            )
          ) : (
            <>
              <h3>Every step of the way.</h3>
              <p className={s.muted}>Earlier saved versions of this note.</p>
              {versions.length ? (
                versions.map((v) => (
                  <button
                    key={v.id}
                    className={s.version}
                    onClick={() => {
                      setPreview(v);
                      setRestore(false);
                    }}
                  >
                    <History size={16} />
                    <span>
                      <strong>{new Date(v.createdAt).toLocaleString()}</strong>
                      <small>{v.author} · Preview version</small>
                    </span>
                  </button>
                ))
              ) : (
                <Empty title="Your story starts here">
                  Earlier versions appear when you edit this note.
                </Empty>
              )}
            </>
          )}
        </aside>
      </div>
      {preview && (
        <Modal
          title={restore ? "Restore this version?" : "A look back"}
          description={
            restore
              ? "Your current note will be saved as a version. No history will be lost."
              : new Date(preview.createdAt).toLocaleString()
          }
          onClose={() => setPreview(undefined)}
        >
          <h3>{preview.title}</h3>
          <p className={s.previewBody}>{preview.body}</p>
          <button
            className={s.primary}
            onClick={async () => {
              if (!canEdit || savingRef.current) return;
              if (!restore) {
                setRestore(true);
                return;
              }
              try {
                generation.current++;
                await pendingSave.current?.catch(() => undefined);
                if (dirtyRef.current) await repo.notes.save(noteRef.current!);
                const restored = await repo.notes.restore(id, preview.id);
                dirtyRef.current = false;
                setDirty(false);
                setNote(restored);
                setDraftBody(restored.body);
                noteRef.current = restored;
                setVersions(await repo.notes.versions(id));
                setPreview(undefined);
                setStatus("Version restored");
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {restore ? "Confirm restore" : "Restore version"}
          </button>
        </Modal>
      )}
    </>
  );
}
export function CoursePage() {
  const { id = "" } = useParams();
  const { state, repo } = useApp();
  const [params] = useSearchParams();
  const course = state.courses.find((c) => c.id === id);
  const [folders, setFolders] = useState<Record<string, Note[]>>({});
  useEffect(() => {
    void repo.courses.folders(id).then(setFolders);
  }, [id, state.notes]);
  if (!course)
    return (
      <Empty title="Course not found">
        <Link to="/notes">Browse your notes</Link>
      </Empty>
    );
  const selected = params.get("lecture");
  return (
    <>
      <PageHeading
        eyebrow={course.code + " · " + course.term}
        title={course.name}
        description="Your lectures, notes, and next steps."
        actions={
          <Link className={s.secondary} to={`/notes?course=${id}`}>
            All course notes
          </Link>
        }
      />
      {selected && (
        <div className={s.notice}>
          Lecture notes for {selected} ·{" "}
          <Link to={`/courses/${id}`}>Show all lectures</Link>
        </div>
      )}
      {Object.entries(folders)
        .filter(([date]) => !selected || date === selected)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, notes]) => (
          <section key={date} className={s.section}>
            <div className={s.sectionHeading}>
              <h2>
                {new Date(date + "T12:00:00").toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                })}
              </h2>
              <span className={s.muted}>{notes.length} notes</span>
            </div>
            <div className={s.noteGrid}>
              {notes.map((n) => (
                <NoteCard note={n} key={n.id} />
              ))}
            </div>
          </section>
        ))}
      {(!Object.keys(folders).length || (selected && !folders[selected])) && (
        <Empty title="A fresh lecture folder">
          No notes here yet.{" "}
          <Link to={`/notes?course=${id}`}>Browse this course’s notes</Link>
        </Empty>
      )}
      <section className={s.panel}>
        <h2>Coming up in this course</h2>
        {state.events
          .filter((e) => e.courseId === id)
          .map((e) => (
            <Link
              key={e.id}
              to={`/schedule?date=${e.date}`}
              className={s.eventLink}
            >
              <span>
                {e.date} · {e.time}
              </span>
              <strong>{e.title}</strong>
              <small>{e.kind}</small>
            </Link>
          ))}
      </section>
    </>
  );
}
