import { useEffect, useRef, useState } from "react";
import {
  useNavigate,
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
import type { Note, NoteVersion, Comment } from "../domain";
import s from "../app/App.module.css";
export function Notes() {
  const { repo, state } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(false);
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
            onClick={async () => {
              try {
                const n = await repo.notes.create({});
                navigate(`/notes/${n.id}`);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Plus size={18} /> New note
          </button>
        }
      />
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
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [comment, setComment] = useState("");
  const [preview, setPreview] = useState<NoteVersion>();
  const [restore, setRestore] = useState(false);
  const [dirty, setDirty] = useState(false);
  const noteRef = useRef<Note>();
  const dirtyRef = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    setNote(undefined);
    setError("");
    Promise.all([
      repo.notes.get(id),
      repo.notes.comments(id),
      repo.notes.versions(id),
    ])
      .then(([n, c, v]) => {
        if (active) {
          setNote(n);
          noteRef.current = n;
          setComments(c);
          setVersions(v);
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [id, repo]);
  useEffect(() => {
    if (!dirty || !note) return;
    const current = ++generation.current;
    const timer = setTimeout(async () => {
      try {
        await repo.notes.save(note);
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
  }, [note, dirty]);
  useEffect(() => {
    const save = () => {
      if (noteRef.current && dirtyRef.current) {
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
  function edit(patch: Partial<Note>) {
    if (!note) return;
    const n = { ...note, ...patch };
    noteRef.current = n;
    dirtyRef.current = true;
    setNote(n);
    setDirty(true);
    setStatus("Saving…");
  }
  if (error && !note)
    return (
      <Empty title="We couldn’t open that note">
        {error} <Link to="/notes">Back to notes</Link>
      </Empty>
    );
  if (!note) return <p role="status">Opening your note…</p>;
  return (
    <>
      <div className={s.editorTop}>
        <Link className={s.textLink} to="/notes">
          <ArrowLeft size={16} /> All notes
        </Link>
        <span role="status" className={s.muted}>
          <Check size={14} /> {status}
        </span>
        <button
          className={s.iconButton}
          aria-label={note.pinned ? "Unpin note" : "Pin note"}
          aria-pressed={note.pinned}
          onClick={() => edit({ pinned: !note.pinned })}
        >
          <Pin size={18} />
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
            onChange={(e) => edit({ title: e.target.value })}
          />
          <div className={s.noteMetadata}>
            <label>
              Course
              <select
                value={note.courseId}
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
                onChange={(e) => edit({ lectureDate: e.target.value })}
              />
            </label>
            <label>
              Category
              <select
                value={note.category}
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
            value={note.body}
            onChange={(e) => edit({ body: e.target.value })}
          />
        </section>
        <aside className={s.inspector}>
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
                <form
                  className={s.form}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await repo.notes.comment(id, comment);
                      setComment("");
                      setComments(await repo.notes.comments(id));
                    } catch (e) {
                      setError((e as Error).message);
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
                  <button disabled={!comment.trim()} className={s.primary}>
                    Post comment
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
              if (!restore) {
                setRestore(true);
                return;
              }
              try {
                if (dirty) await repo.notes.save(note);
                const restored = await repo.notes.restore(id, preview.id);
                dirtyRef.current = false;
                setDirty(false);
                setNote(restored);
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
