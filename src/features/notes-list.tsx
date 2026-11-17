import { useEffect, useState, type CSSProperties } from "react";
import {
  useSearchParams,
  useLocation,
  useNavigate,
  Link,
} from "react-router-dom";
import {
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Plus,
  Pin,
  X,
} from "lucide-react";
import { useApp } from "../app/context";
import { PageHeading, NoteCard, Empty, Modal, DeleteNoteDialog, countOf} from "../shared/ui";
import { groupNotesByCategory, isNoteCategory, NOTE_CATEGORIES, type NoteCategory } from "../services/categories";
import type {
  Note,
} from "../domain";
import s from "../shared/ui.module.css";
import css from "./notes-list.module.css";
import { createHttpNoteShares } from "../services/note-shares-http";
// Shared classes this screen's own rules also name (see notes-list.module.css), applied together.
const both = { actions: `${s.actions} ${css.actions}`, secondary: `${s.secondary} ${css.secondary}`, segment: `${s.segment} ${css.segment}` };

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
  // Set when "New note" is chosen from an empty category, so the new note lands in that category.
  const [draftCategory, setDraftCategory] = useState<NoteCategory>();
  const [noteToDelete, setNoteToDelete] = useState<Note>();
  const [pinning, setPinning] = useState("");
  const [pinError, setPinError] = useState("");
  // Card 158: notes friends shared with this student through a course (card 156).
  const [shared, setShared] = useState<Note[]>([]);
  useEffect(() => {
    let active = true;
    // The demo has no server account, so it never has shared notes.
    createHttpNoteShares().sharedWithMe().then((list) => active && setShared(list), () => active && setShared([]));
    return () => { active = false; };
  }, [state.user?.id]);
  const location = useLocation();
  const navigate = useNavigate();
  // The editor sends the owner here after deleting, with a one-time message.
  const [announcement, setAnnouncement] = useState(
    location.state?.noteDeleted ? "Note deleted." : "",
  );
  useEffect(() => {
    // Drop the message from history so a reload doesn't repeat it.
    if (location.state?.noteDeleted)
      navigate({ pathname: location.pathname, search: location.search }, { replace: true });
  }, []);
  // An empty result that comes only from a category filter gets its own message and a "New note"
  // action for that category; any other empty result keeps the general "No notes found".
  const selectedCategory = params.get("category");
  const selectedTag = params.get("tag") || "";
  // The provider keeps the full accessible notes list, so choices stay available
  // even when the current search or another filter has no matches.
  const availableTags = [...new Set([...state.notes.flatMap((note) => note.tags), selectedTag].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const emptyCategory =
    isNoteCategory(selectedCategory) &&
    !params.get("q") &&
    !["tag", "course", "visibility", "from", "to"].some((name) => params.get(name))
      ? selectedCategory
      : undefined;
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
    setDraftCategory(undefined);
    setCreateStatus("All changes saved");
    setCreating(false);
  }

  function openCreateNote(category?: NoteCategory) {
    setDraftTitle("");
    setDraftBody("");
    setDraftCategory(category);
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
        ...(draftCategory ? { category: draftCategory } : {}),
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

  // One request per click; the list reloads from the provider afterwards, so the order comes from the server.
  async function togglePin(note: Note) {
    if (pinning) return;
    setPinning(note.id);
    setPinError("");
    try {
      await repo.notes.setPinned(note.id, !note.pinned);
      await refresh();
    } catch (e) {
      setPinError((e as Error).message);
    } finally {
      setPinning("");
    }
  }

  async function deleteNote(note: Note) {
    await repo.notes.delete(note.id);
    // Search, filters, sort, and view live in the URL and stay untouched.
    setNotes((list) => list.filter((n) => n.id !== note.id));
    setNoteToDelete(undefined);
    setAnnouncement("Note deleted.");
    await refresh();
  }

  const active = ["course", "category", "tag", "visibility", "from", "to"].filter(
    (k) => params.get(k),
  );
  return (
    <>
      <PageHeading
        eyebrow="Good ideas live here"
        title="Your notes"
        description={`${countOf(notes.length, "note")} in your space`}
        actions={
          <button
            className={s.primary}
            onClick={() => openCreateNote()}
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

            {draftCategory && (
              <p className={s.muted}>This note will be saved in {draftCategory}.</p>
            )}

            <p role="status" className={s.muted}>
              {createStatus}
            </p>

            <div className={both.actions}>
              <button
                type="button"
                className={both.secondary}
                onClick={cancelCreateNote}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
      <div className={css.libraryToolbar}>
        <label className={css.search}>
          <Search size={18} />
          <input
            aria-label="Search notes"
            placeholder="Find a thought, a topic, a little inspiration…"
            value={params.get("q") || ""}
            onChange={(e) => set("q", e.target.value)}
          />
        </label>
        <button
          className={`${both.secondary} ${filters ? s.activeButton : ""}`}
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
        <div className={both.segment}>
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
        <div className={css.filters} role="group" aria-label="Filter notes">
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
              {NOTE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Tags
            <select
              value={selectedTag}
              onChange={(e) => set("tag", e.target.value)}
            >
              <option value="">All tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
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
      {(active.length > 0 || params.get("q")) && (
      <div className={css.libraryMeta}>
        <div className={both.actions}>
          {active.map((k) => (
            <button className={css.chip} key={k} onClick={() => set(k, "")}
              aria-label={k === "tag" ? `Clear tag filter ${params.get(k)}` : undefined}>
              {k === "course"
                ? state.courses.find((c) => c.id === params.get(k))?.code || params.get(k)
                : params.get(k)}{" "}
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
      )}
      {announcement && (
        <p role="status" className={s.notice}>
          {announcement}
        </p>
      )}
      {pinError && (
        <p role="alert" className={s.error}>
          {pinError}
        </p>
      )}
      {error ? (
        <p role="alert" className={s.error}>
          {error}
        </p>
      ) : loading ? (
        <p role="status" className={css.loading}>Gathering your notes…</p>
      ) : notes.length ? (
        // Card 42: notes sit under their category heading (with a count); a selected
        // category filter leaves just that one group.
        groupNotesByCategory(notes).map(({ category, notes: group }) => (
          <section
            key={category}
            className={`${css.categoryGroup} ${css.group}`}
            aria-labelledby={`category-heading-${category}`}
          >
            <h2 id={`category-heading-${category}`} className={css.categoryHeading}>
              {category} ({group.length})
            </h2>
            <div
              className={`${s.noteGrid} ${params.get("view") === "list" ? `${s.noteList} ${css.list}` : css.grid}`}
            >
              {group.map((n, i) => (
                <div key={n.id} className={css.cell} style={{ "--i": Math.min(i, 8) } as CSSProperties}>
                  <NoteCard
                    note={n}
                    onDelete={
                      n.ownerId === state.user?.id
                        ? () => {
                            setAnnouncement("");
                            setNoteToDelete(n);
                          }
                        : undefined
                    }
                  />
                  {n.ownerId === state.user?.id && (
                    <button
                      type="button"
                      className={css.pinButton}
                      aria-label={`${n.pinned ? "Unpin" : "Pin"} ${n.title}`}
                      aria-pressed={Boolean(n.pinned)}
                      disabled={!!pinning}
                      onClick={() => togglePin(n)}
                    >
                      <Pin size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))
      ) : emptyCategory ? (
        <Empty title={`No ${emptyCategory} notes yet`}>
          Notes you put in {emptyCategory} will show up here.{" "}
          <button className={s.primary} onClick={() => openCreateNote(emptyCategory)}>
            <Plus size={18} /> New note
          </button>
        </Empty>
      ) : (
        <Empty title="No notes found">
          {active.length > 0 || params.get("q") ? (
            <>
              Nothing matches right now. Try another keyword or clear a filter to find your way back.{" "}
              <button className={s.secondary} onClick={() => setParams({})}>Clear search and filters</button>
            </>
          ) : (
            <>
              Your space is empty. Write your first note and it will show up here.{" "}
              <button className={s.primary} onClick={() => openCreateNote()}>
                <Plus size={18} /> New note
              </button>
            </>
          )}
        </Empty>
      )}
      {!!shared.length && (
        <section className={`${css.categoryGroup} ${css.group} ${css.sharedSection}`} aria-labelledby="shared-with-me-heading">
          <h2 id="shared-with-me-heading" className={css.categoryHeading}>Shared with me</h2>
          <p className={css.sharedHint}>{countOf(shared.length, "note")} friends shared through your courses. You can read them but not change them.</p>
          <ul className={css.sharedList}>
            {shared.map((n) => (
              <li key={n.id}>
                <Link to={`/notes/${n.id}`} className={css.sharedNote}>
                  <strong>{n.title}</strong>
                  <small>From {n.sharedBy?.name} · {n.sharedBy?.courseCode}</small>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {noteToDelete && (
        <DeleteNoteDialog
          title={noteToDelete.title}
          onClose={() => setNoteToDelete(undefined)}
          onDelete={() => deleteNote(noteToDelete)}
        />
      )}
    </>
  );
}
// True when two copies of a note agree on every field the editor autosaves besides the text.
