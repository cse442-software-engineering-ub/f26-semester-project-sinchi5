import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { editorHtml } from "../services/noteText";
import {
  useParams,
  useLocation,
  useNavigate,
  Link,
} from "react-router-dom";
import {
  ArrowLeft,
  History,
  MessageCircle,
  Check,
  CalendarClock,
  Pin,
  Trash2,
  SlidersHorizontal,
  Users,
  MoreHorizontal,
} from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { useApp, useHoldRefresh } from "../app/context";
import { Empty, Modal, DeleteNoteDialog} from "../shared/ui";
import { MAX_COMMENT_LENGTH } from "../domain";
import type {
  Note,
  NoteVersion,
  Comment,
  CommentScenario,
  Collaborator,
} from "../domain";
import css from "./note-editor.module.css";
import s from "../shared/ui.module.css";
import { Collaborators } from "./collaborators";
// Card 241: TipTap is its own chunk, fetched when a note opens.
const RichEditor = lazy(() => import("./rich-editor"));
const loadingEditor = <p role="status">Loading the editor…</p>;
// Shared classes this screen's own rules also name (see note-editor.module.css), applied together.
const both = { muted: `${s.muted} ${css.muted}`, segment: `${s.segment} ${css.segment}`, textLink: `${s.textLink} ${css.textLink}` };

function sameNoteFields(a: Note, b: Note) {
  return (
    a.courseId === b.courseId &&
    a.lectureDate === b.lectureDate &&
    a.category === b.category &&
    a.visibility === b.visibility &&
    JSON.stringify(a.tags) === JSON.stringify(b.tags)
  );
}

function reminderFields(value: Date) {
  const date = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const time = `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

function reminderLabel(remindAt: string) {
  const value = new Date(remindAt);
  return `${reminderFields(value).date} at ${value.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
}
export function NoteWorkspace() {
  const { id } = useParams();
  // Task #78 / Story #19 AT1: isolate drafts and pending responses when switching notes.
  return <NoteEditor key={id} />;
}
function NoteEditor() {
  const { id = "" } = useParams();
  // The quick-create editor still autosaves its first title; reopened notes use Save/Cancel.
  const isNewNote = useLocation().state?.newNote === true;
  const navigate = useNavigate();
  const { repo, state, refresh } = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState<Note>();
  const [titleDraft, setTitleDraft] = useState("");
  const [status, setStatus] = useState("All changes saved");
  const [error, setError] = useState("");
  const [panel, setPanel] = useState("comments");
  // Card 242: both panels start closed and are not remembered.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const peopleToggle = useRef<HTMLButtonElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  // Phones keep the bar short: History, Reminder, Pin, Cancel and Delete go into a menu. Read the width from the window that holds the screen.
  const [phone, setPhone] = useState(false);
  const loaded = !!note;
  // Layout effect: the phone bar (with More actions) is in place before the first paint, so nothing sees the desktop bar at phone width first.
  useLayoutEffect(() => {
    const query = screenRef.current?.ownerDocument.defaultView?.matchMedia("(max-width: 767px)");
    if (!query) return;
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [loaded]);
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
  // The editor's HTML once the writer changes it; null while the body is as saved. editorKey restarts the editor.
  const [draftBody, setDraftBody] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const pendingSave = useRef<Promise<Note>>();
  const [dirty, setDirty] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [reminderError, setReminderError] = useState("");
  const [reminderNotice, setReminderNotice] = useState("");
  const [reminderSaving, setReminderSaving] = useState(false);
  const noteRef = useRef<Note>();
  const dirtyRef = useRef(false);
  // Card 257: unsaved title, body, details, or comment text keeps the background re-read away.
  useHoldRefresh(dirty || draftBody !== null || (!!note && titleDraft !== note.title) || comment !== "" || reminderOpen);
  const generation = useRef(0);
  // The note as the server last confirmed it, so a failed category save can put the selector back.
  const savedNote = useRef<Note>();
  useEffect(() => {
    let active = true;
    setNote(undefined);
    noteRef.current = undefined;
    dirtyRef.current = false;
    setDirty(false);
    setDraftBody(null);
    setTitleDraft("");
    setStatus("All changes saved");
    generation.current++;
    setError("");
    repo.notes.get(id)
      // Card 158: a note shared through a course has no history or collaborators to show its reader.
      .then((n): Promise<[Note, NoteVersion[], Collaborator[]]> => n.sharedBy ? Promise.resolve([n, [], []])
        : Promise.all([n, repo.notes.versions(id), repo.notes.collaborators(id)]))
      .then(([n, v, collaborators]) => {
        if (active) {
          setNote(n);
          setEditorKey((k) => k + 1);
          setTitleDraft(n.title);
          noteRef.current = n;
          savedNote.current = n;
          setVersions(v);
          setCollaborators(collaborators);
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
      generation.current++;
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
      // A newer save, restore, or delete has taken over.
      if (current !== generation.current) return;
      try {
        pendingSave.current = repo.notes.save(note);
        await pendingSave.current;
        if (current === generation.current) {
          dirtyRef.current = false;
          setDirty(false);
          savedNote.current = note;
          // A saved change clears an earlier "could not be saved" alert.
          setError("");
          setStatus("All changes saved");
          setVersions(await repo.notes.versions(id));
          await refresh();
        }
      } catch (e) {
        if (current !== generation.current) return;
        const lastSaved = savedNote.current;
        if (lastSaved && note.category !== lastSaved.category) {
          // The category did not save, so show the last saved one again and say why.
          const reverted = { ...(noteRef.current ?? note), category: lastSaved.category };
          noteRef.current = reverted;
          setNote(reverted);
          if (sameNoteFields(reverted, lastSaved)) {
            dirtyRef.current = false;
            setDirty(false);
          }
          setError(`The category could not be saved. ${(e as Error).message}`);
        } else {
          setError((e as Error).message);
        }
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
  // Drafts stay out of metadata autosaves. Quick-create alone updates note.title.
  function edit(patch: Partial<Note>) {
    if (!note || !canEdit || savingRef.current) return;
    const n = { ...note, ...patch };
    noteRef.current = n;
    dirtyRef.current = true;
    setNote(n);
    setDirty(true);
    setStatus("Saving…");
  }

  async function saveNote() {
    if (!noteRef.current || !canEdit || savingRef.current) return;
    const title = titleDraft.trim();
    if (!title || Array.from(title).length > 255) {
      setError("Enter a note title of 1 to 255 characters.");
      setStatus("Not saved");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    setStatus("Saving…");
    const current = ++generation.current;
    try {
      // Finish metadata autosave before submitting both drafts, so an older
      // write cannot overwrite the explicitly saved title or body.
      await pendingSave.current?.catch(() => undefined);
      const saved = await repo.notes.save({
        ...noteRef.current!,
        title,
        body: draftBody ?? noteRef.current!.body,
        format: "html",
      });
      // Task #78 / Story #19 AT1-3: ignore responses after leaving this editor.
      // Disabled controls during Save protect the submitted draft from newer edits.
      if (current !== generation.current) return;
      noteRef.current = saved;
      savedNote.current = saved;
      setNote(saved);
      setTitleDraft(saved.title);
      setDraftBody(null);
      dirtyRef.current = false;
      setDirty(false);
      setStatus("All changes saved");
    } catch (e) {
      if (current !== generation.current) return;
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
  function cancelEdits() {
    if (!note || savingRef.current) return;
    setTitleDraft(note.title);
    setDraftBody(null);
    setEditorKey((k) => k + 1);
    setError("");
    setStatus(dirtyRef.current ? "Saving…" : "All changes saved");
  }
  async function deleteNote() {
    // Stop the autosave timer and the unmount/pagehide save so nothing
    // writes the note back after it is gone.
    const wasDirty = dirtyRef.current;
    dirtyRef.current = false;
    setDirty(false);
    generation.current++;
    try {
      await pendingSave.current?.catch(() => undefined);
      await repo.notes.delete(id);
    } catch (e) {
      // Stay in the editor with unsaved changes; autosave resumes.
      dirtyRef.current = wasDirty;
      setDirty(wasDirty);
      throw e;
    }
    await refresh();
    navigate("/notes", { state: { noteDeleted: true } });
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
  function openReminder() {
    const value = note?.remindAt ? new Date(note.remindAt) : new Date(Date.now() + 5 * 60_000);
    const fields = reminderFields(value);
    setReminderDate(fields.date);
    setReminderTime(fields.time);
    setReminderError("");
    setReminderOpen(true);
  }
  async function persistReminder(remindAt: string | null) {
    if (!noteRef.current || reminderSaving) return;
    setReminderSaving(true);
    setReminderError("");
    try {
      await pendingSave.current;
      const saved = await repo.notes.setReminder(id, remindAt);
      const next = { ...noteRef.current, remindAt: saved.remindAt ?? null };
      noteRef.current = next;
      savedNote.current = savedNote.current ? { ...savedNote.current, remindAt: next.remindAt } : saved;
      setNote(next);
      await refresh();
      if (remindAt === null) setReminderNotice("");
      setReminderOpen(false);
    } catch (e) {
      setReminderError((e as Error).message);
    } finally {
      setReminderSaving(false);
    }
  }
  function setReminder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = new Date(`${reminderDate}T${reminderTime}:00`);
    if (!reminderDate || !reminderTime || !Number.isFinite(value.getTime()) || value.getTime() <= Date.now()) {
      setReminderError("Choose a time in the future.");
      return;
    }
    // Permission must be requested directly from this submit gesture.
    if (typeof Notification === "undefined") {
      setReminderNotice("This browser cannot show notifications. Your reminder is still saved.");
    } else if (Notification.permission === "default") {
      void Notification.requestPermission().then((permission) => {
        setReminderNotice(permission === "granted" ? "" : "Allow browser notifications to receive this reminder.");
      }).catch(() => setReminderNotice("Allow browser notifications to receive this reminder."));
    } else {
      setReminderNotice(Notification.permission === "granted" ? "" : "Allow browser notifications to receive this reminder.");
    }
    void persistReminder(value.toISOString());
  }
  if (error && !note)
    return (
      <Empty title="We couldn’t open that note">
        {error} <Link to="/notes">Back to notes</Link>
      </Empty>
    );
  if (!note) return <p role="status">Opening your note…</p>;
  if (note.sharedBy) return <SharedNote note={note} />;
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
  const hasDraftChanges =
  titleDraft !== note.title || draftBody !== null;
  return (
    <>
      <div className={css.screen} ref={screenRef} onKeyDown={(e) => {
        if (e.key === "Escape" && peopleOpen && phone) {
          setPeopleOpen(false);
          peopleToggle.current?.focus();
        }
      }}>
      <div className={css.editorTop}>
        <Link className={both.textLink} to="/notes">
          <ArrowLeft size={16} /> All notes
        </Link>
        <input
          className={css.noteTitle}
          aria-label="Note title"
          value={titleDraft}
          disabled={!canEdit || saving}
          onChange={(e) => {
            setTitleDraft(e.target.value);
            if (isNewNote) edit({ title: e.target.value });
          }}
        />
        <span role="status" className={both.muted}>
          <Check size={14} /> {saving ? "Saving…" : hasDraftChanges ? "Unsaved changes" : status}
        </span>
        <button
          type="button"
          className={s.primary}
          disabled={!canEdit || saving || pinning || (!hasDraftChanges && !dirty)}
          onClick={saveNote}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {!phone && (
          <>
        <button
          type="button"
          className={s.secondary}
          disabled={!canEdit || saving || !hasDraftChanges}
          onClick={cancelEdits}
        >
          Cancel
        </button>
        <button
          type="button"
          className={s.secondary}
          onClick={() => {
            setPanel("history");
            setPeopleOpen(true);
          }}
        >
          <History size={18} aria-hidden="true" /> History
        </button>
        {canEdit && (
          <button className={s.secondary} type="button" onClick={openReminder} disabled={saving || reminderSaving}>
            <CalendarClock size={18} aria-hidden="true" /> Reminder
          </button>
        )}
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
        {isOwner && (
          <button
            className={s.dangerOutline}
            disabled={saving}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={18} aria-hidden="true" /> Delete note
          </button>
        )}
          </>
        )}
        <button type="button" className={`${s.secondary} ${css.toggle}`} aria-expanded={detailsOpen} aria-controls="note-details"
          onClick={() => setDetailsOpen((o) => !o)}>
          <SlidersHorizontal size={18} aria-hidden="true" /> Details
        </button>
        <button type="button" ref={peopleToggle} className={`${s.secondary} ${css.toggle}`} aria-expanded={peopleOpen} aria-controls="note-people"
          onClick={() => setPeopleOpen((o) => !o)}>
          <Users size={18} aria-hidden="true" /> People
        </button>
        {phone && (
          <Menu.Root>
            <Menu.Trigger className={s.secondary} aria-label="More actions" title="More actions">
              <MoreHorizontal size={18} aria-hidden="true" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner className={css.menuLayer} side="bottom" align="end" sideOffset={8}>
                <Menu.Popup className={css.menu}>
                  <Menu.Item className={css.menuItem} onClick={() => { setPanel("history"); setPeopleOpen(true); }}>
                    <History size={18} aria-hidden="true" /> History
                  </Menu.Item>
                  {canEdit && (
                    <Menu.Item className={css.menuItem} disabled={saving || reminderSaving} onClick={openReminder}>
                      <CalendarClock size={18} aria-hidden="true" /> Reminder
                    </Menu.Item>
                  )}
                  <Menu.Item className={css.menuItem} disabled={pinning || !canEdit || saving} onClick={togglePin}>
                    <Pin size={18} aria-hidden="true" /> {note.pinned ? "Unpin" : "Pin"}
                  </Menu.Item>
                  <Menu.Item className={css.menuItem} disabled={!canEdit || saving || !hasDraftChanges} onClick={cancelEdits}>
                    Cancel
                  </Menu.Item>
                  {isOwner && (
                    <Menu.Item className={`${css.menuItem} ${css.menuDanger}`} disabled={saving} onClick={() => setConfirmDelete(true)}>
                      <Trash2 size={18} aria-hidden="true" /> Delete note
                    </Menu.Item>
                  )}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        )}
      </div>
      {note.remindAt && <p className={css.reminderSummary}>Reminder: {reminderLabel(note.remindAt)}</p>}
      {reminderNotice && <p className={s.notice} role="status">{reminderNotice}</p>}
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {reminderOpen && (
        <Modal title="Reminder" description="Choose when to be notified while this app is open."
          onClose={() => setReminderOpen(false)} dismissible={!reminderSaving}>
          <form className={s.form} onSubmit={setReminder}>
            <div className={s.formRow}>
              <label>Date<input type="date" required value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)} /></label>
              <label>Time<input type="time" required value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)} /></label>
            </div>
            {reminderError && <p className={s.error} role="alert">{reminderError}</p>}
            <div className={s.actions}>
              <button type="submit" className={s.primary} disabled={reminderSaving}>Set reminder</button>
              {note.remindAt && (
                <button type="button" className={s.secondary} disabled={reminderSaving}
                  onClick={() => void persistReminder(null)}>Remove reminder</button>
              )}
            </div>
          </form>
        </Modal>
      )}
      <div id="note-details" className={css.details} data-open={detailsOpen}>
        <div className={css.detailsInner}>
          <div className={css.detailsPad}>
          <div className={css.noteMetadata}>
              <label>
                Course
                <select
                  value={note.courseId}
                  disabled={!canEdit || saving}
                  onChange={(e) => edit({ courseId: e.target.value })}
                >
                  <option value="">Not detected</option>
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
                  aria-label="Lecture date"
                  aria-describedby={!note.lectureDate ? "note-date-missing" : undefined}
                  value={note.lectureDate}
                  disabled={!canEdit || saving}
                  onChange={(e) => edit({ lectureDate: e.target.value })}
                />
                {!note.lectureDate && <small id="note-date-missing">Not detected</small>}
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
            <label className={css.tagsLabel}>
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
            {/* A future "Linked event" row goes here. */}
          </div>
        </div>
      </div>
      <div className={css.editorLayout} data-people={peopleOpen}>
        <section className={css.editor}>
          <Suspense fallback={loadingEditor}>
            <RichEditor key={editorKey} html={editorHtml(note.body, note.format)} label="Note body"
              editable={canEdit && !saving} onChange={setDraftBody} />
          </Suspense>
        </section>
        {phone && peopleOpen && <div className={css.scrim} data-testid="people-scrim" onClick={() => { setPeopleOpen(false); peopleToggle.current?.focus(); }} />}
        <div className={css.people} data-open={peopleOpen}>
        <aside id="note-people" className={css.inspector} aria-label="People and history">
          <div className={css.sheetHead}>
            <h2 className={css.sheetTitle}>People</h2>
            <button type="button" className={s.secondary}
              onClick={() => { setPeopleOpen(false); peopleToggle.current?.focus(); }}>Close panel</button>
          </div>
          <Collaborators
            key={`${note.id}:${state.user?.id || ""}`}
            noteId={note.id}
            isOwner={isOwner}
            repository={repo.notes}
          />
          <div className={both.segment}>
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
                      <article key={c.id} className={css.comment}>
                        <strong>{c.author}</strong>
                        <small>{new Date(c.createdAt).toLocaleDateString()}</small>
                        <p>{c.body}</p>
                      </article>
                    ))}
                    {!comments.length && (
                      <p className={both.muted}>Be the first to add a thought.</p>
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
                  <small className={both.muted}>
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
              <p className={both.muted}>Earlier saved versions of this note.</p>
              {versions.length ? (
                versions.map((v) => (
                  <button
                    key={v.id}
                    className={css.version}
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
      </div>
      </div>
      {confirmDelete && (
        <DeleteNoteDialog
          title={note.title}
          onClose={() => setConfirmDelete(false)}
          onDelete={deleteNote}
        />
      )}
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
          <div className={css.previewBody}>
            <Suspense fallback={loadingEditor}>
              <RichEditor key={preview.id} html={editorHtml(preview.body)} label="Version text" editable={false} />
            </Suspense>
          </div>
          <button
            className={s.primary}
            onClick={async () => {
              if (!canEdit || savingRef.current) return;
              if (!restore) {
                setRestore(true);
                return;
              }
              savingRef.current = true;
              setSaving(true);
              try {
                generation.current++;
                await pendingSave.current?.catch(() => undefined);
                if (dirtyRef.current) await repo.notes.save(noteRef.current!);
                const restored = await repo.notes.restore(id, preview.id);
                dirtyRef.current = false;
                setDirty(false);
                setNote(restored);
                setDraftBody(null);
                setEditorKey((k) => k + 1);
                setTitleDraft(restored.title);
                noteRef.current = restored;
                savedNote.current = restored;
                setVersions(await repo.notes.versions(id));
                setPreview(undefined);
                setStatus("Version restored");
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                savingRef.current = false;
                setSaving(false);
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
// Card 158: a note a friend shared through a course. Read only: no save, pin, delete, or formatting controls, and none of the owner's history or comments.
function SharedNote({ note }: { note: Note }) {
  return (
    <>
      <div className={css.editorTop}>
        <Link className={both.textLink} to="/notes">
          <ArrowLeft size={16} /> All notes
        </Link>
      </div>
      <article className={css.sharedReader}>
        <p className={s.notice}>Shared by {note.sharedBy!.name}. You can read this note.</p>
        <p className={both.muted}>{note.sharedBy!.courseCode}{note.lectureDate ? ` · ${note.lectureDate}` : ""}</p>
        <h1 className={css.sharedTitle}>{note.title}</h1>
        <Suspense fallback={loadingEditor}>
          <RichEditor html={editorHtml(note.body, note.format)} label="Note text" editable={false} />
        </Suspense>
      </article>
    </>
  );
}

