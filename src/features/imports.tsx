import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  UploadCloud,
  Camera,
  FileText,
  Check,
  AlertCircle,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { useApp } from "../app/context";
import { fileTypeProblem } from "../services/syllabus-text";
import { Modal } from "../shared/ui";
import type { DetectedEvent, EventKind, UploadKind, UploadJob } from "../domain";
import s from "../app/App.module.css";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const STEPS = ["Choose", "Read", "Check", "Done"];
const PHASE_STEP: Record<string, number> = { pick: 0, queued: 1, processing: 1, failed: 1, review: 2, completed: 3 };
// Card 46: the event types a syllabus can add, as the review screen names them.
const EVENT_TYPES: [EventKind, string][] = [["assignment", "Assignment"], ["exam", "Exam"], ["quiz", "Quiz"], ["deadline", "Deadline"], ["other", "Other"]];
const READ_BY: Record<NonNullable<UploadJob["reader"]>, string> = {
  rules: "with the free reader in your browser",
  ai: "with automatic reading",
  "rules-only": "with the free reader",
  sample: "in this preview",
};
const megabytes = (bytes: number) => `${Math.max(0.1, Math.round(bytes / 104857.6) / 10)} MB`;

// Card 45: shows where the student is in the syllabus upload, so every screen says what comes next.
function Steps({ phase }: { phase: string }) {
  const current = PHASE_STEP[phase] ?? 0;
  return (
    <ol className={s.steps} aria-label={`Step ${current + 1} of ${STEPS.length}`}>
      {STEPS.map((step, i) => (
        <li key={step} aria-current={i === current ? "step" : undefined} data-done={i < current || undefined}>
          {i < current ? <Check size={13} aria-hidden="true" /> : <span aria-hidden="true">{i + 1}</span>}
          {i < current && <span className={s.srOnly}>Done: </span>}
          {step}
        </li>
      ))}
    </ol>
  );
}

export function ImportDialog({
  kind,
  onClose,
}: {
  kind: UploadKind;
  onClose: () => void;
}) {
  const { repo, state, refresh } = useApp();
  const [file, setFile] = useState<File>();
  const [job, setJob] = useState<UploadJob>();
  const [phase, setPhase] = useState("pick");
  const [error, setError] = useState("");
  const [scenario, setScenario] = useState("success");
  const [busy, setBusy] = useState(false);
  const [courseId, setCourseId] = useState(state.courses[0]?.id || "");
  // Set while the AI reader double-checks a syllabus the free rules couldn't read well.
  const [checking, setChecking] = useState(false);
  // A slow upload must not update the window after it closes. Setting it on every mount matters:
  // React's development mode mounts, unmounts, and mounts again.
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);
  // Card 45: queued while the file is registered, processing while it is read, then review or failed.
  async function run(result = scenario) {
    if (!file) return;
    setError("");
    setChecking(false);
    setPhase("queued");
    let queued: UploadJob;
    try {
      // The short waits keep each step on screen long enough to read.
      [queued] = await Promise.all([repo.imports.start(file, kind, result, courseId), wait(250)]);
    } catch (e) {
      if (open.current) {
        setError((e as Error).message);
        setPhase("pick");
      }
      return;
    }
    if (!open.current) return;
    setPhase("processing");
    try {
      const [done] = await Promise.all([repo.imports.process(queued, file, result, () => open.current && setChecking(true)), wait(900)]);
      if (!open.current) return;
      setJob(done);
      setPhase(done.state === "failed" ? "failed" : "review");
    } catch (e) {
      // The file was uploaded but couldn't be read, so offer another try, another file, or typing events in.
      if (open.current) {
        setError((e as Error).message);
        setJob({ ...queued, state: "failed" });
        setPhase("failed");
      }
    }
  }
  function chooseAnother() {
    setError("");
    setFile(undefined);
    setJob(undefined);
    setPhase("pick");
  }
  // Card 46: a student can always add an event the readers missed, even when they found none.
  function addEvent() {
    if (!job) return;
    setError("");
    setJob({
      ...job,
      state: job.state === "failed" ? "review" : job.state,
      events: [...job.events, { id: "", courseId: job.metadata.courseId, title: "", kind: "assignment", date: "", time: "",
        location: "", description: "", source: "manual" }],
    });
    setPhase("review");
    const index = job.events.length;
    requestAnimationFrame(() => document.getElementById(`event-title-${index}`)?.focus());
  }
  // The latest choice, so a slow check of an earlier file can't overwrite it.
  const picked = useRef<File>();
  async function pick(f?: File) {
    if (!f) return;
    picked.current = f;
    // A renamed or damaged syllabus is caught as soon as it's chosen, with how to fix it.
    const invalid = repo.imports.validate(f, kind) || (kind === "syllabus" ? await fileTypeProblem(f) : null);
    if (picked.current !== f || !open.current) return;
    setError(invalid || "");
    // An invalid choice replaces the earlier file, so Continue can't send the wrong one.
    setFile(invalid ? undefined : f);
    setJob(undefined);
  }
  async function confirm() {
    if (!job) return;
    setBusy(true);
    try {
      await repo.imports.confirm(job);
      await refresh();
      setPhase("completed");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const title =
    kind === "scan"
      ? "From paper to possibility"
      : kind === "syllabus"
        ? "Your semester, sorted"
        : "Bring your notes along";
  return (
    <Modal
      title={title}
      description={
        kind === "syllabus"
          ? "Review detected dates before adding them to your schedule."
          : "Choose a file, then give it a place in your workspace."
      }
      onClose={onClose}
    >
      {kind === "syllabus" && <Steps phase={phase} />}
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {/* Why the AI reader couldn't help, when the rules' events are shown instead (card 45). */}
      {phase === "review" && job?.notice && <p className={s.notice}>{job.notice}</p>}
      {phase === "pick" && (
        <>
          {kind === "syllabus" && (
            <p className={s.notice}>
              Choose the course, then its syllabus. Notely finds the due dates and shows them to you
              first: nothing is added to your schedule until you check it.
            </p>
          )}
          {kind === "syllabus" &&
            (state.courses.length ? (
              <div className={s.form}>
                <label>
                  Course
                  <select value={courseId} aria-describedby="syllabus-course-hint" onChange={(e) => setCourseId(e.target.value)}>
                    {state.courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                  <span id="syllabus-course-hint" className={s.hint}>
                    The syllabus’s dates go on this course’s schedule.
                  </span>
                </label>
              </div>
            ) : (
              <p className={s.notice}>
                Add a course in Settings before uploading its syllabus.{" "}
                <Link className={s.inlineLink} to="/settings" onClick={onClose}>Go to Settings</Link>
              </p>
            ))}
          <label
            className={s.dropzone}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void pick(e.dataTransfer.files[0]);
            }}
          >
            {kind === "scan" ? <Camera size={38} /> : <UploadCloud size={38} />}
            <strong>
              {file
                ? file.name
                : kind === "scan"
                  ? "Take a photo or choose an image"
                  : "Drop your file here, or browse"}
            </strong>
            <span>
              {kind === "scan"
                ? "JPG, PNG, or WebP"
                : "PDF, DOCX, TXT, Markdown, or images"}{" "}
              · up to 20 MB
            </span>
            {file && <span>{megabytes(file.size)} · Click or drop another file to replace it</span>}
            <input
              type="file"
              aria-label="Choose upload file"
              accept={
                kind === "scan"
                  ? "image/jpeg,image/png,image/webp"
                  : ".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp"
              }
              capture={kind === "scan" ? "environment" : undefined}
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </label>
          {kind === "syllabus" && (
            <details className={s.demoDetails}>
              <summary>Tips for the best result</summary>
              <ul className={s.tips}>
                <li>The PDF or Word file from your course website works best.</li>
                <li>A photo works too: lay the page flat in good light, with every date readable.</li>
                <li>Only the dates matter, so for a long syllabus the schedule pages are enough.</li>
                <li>You’ll check every date before anything is added, and you can fix or add events.</li>
              </ul>
            </details>
          )}
          <details className={s.demoDetails}>
            <summary>Prototype preview options</summary>
            <p>
              Preview how Notely handles results that need review, or a file
              it can’t read.
            </p>
            <label>
              Processing result
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
              >
                <option value="success">Complete result</option>
                <option value="partial">Needs a little review</option>
                <option value="failure">Processing failed</option>
              </select>
            </label>
          </details>
          <div className={s.actions}>
            <button
              className={s.primary}
              disabled={!file || (kind === "syllabus" && !courseId)}
              aria-describedby="upload-next"
              onClick={() => void run()}
            >
              Continue <FileText size={16} />
            </button>
            {/* Says why Continue is greyed out, or what happens next. */}
            <span id="upload-next" className={s.hint} aria-live="polite">
              {kind === "syllabus" && !courseId
                ? "Add a course first."
                : !file
                  ? "Choose a file to continue."
                  : `Next: Notely reads ${file.name}.`}
            </span>
          </div>
        </>
      )}
      {(phase === "queued" || phase === "processing") && (
        <div className={s.empty} role="status">
          <LoaderCircle className={s.spinner} size={36} />
          <h3>
            {phase === "queued"
              ? "Getting your file ready…"
              : "Finding the useful details…"}
          </h3>
          <p>
            {kind !== "syllabus"
              ? "Organizing your notes, one detail at a time."
              : phase === "queued"
                ? "Uploading your file securely."
                : checking
                  ? "The quick reader wasn’t sure about every date, so automatic reading is double-checking the file. This can take up to a minute."
                  : "Reading the dates in your syllabus. This usually takes a few seconds."}
          </p>
        </div>
      )}
      {phase === "failed" && (
        <div className={s.empty}>
          <AlertCircle size={36} />
          <h3>That file needs another try</h3>
          <p>We couldn’t process this upload. Your existing notes are safe.</p>
          <div className={s.actions}>
            <button
              className={s.primary}
              onClick={() => {
                setScenario("success");
                void run("success");
              }}
            >
              Try again
            </button>
            <button className={s.secondary} onClick={chooseAnother}>
              Choose a different file
            </button>
            {kind === "syllabus" && job && (
              <button className={s.secondary} onClick={addEvent}>
                <Plus size={16} /> Add events by hand
              </button>
            )}
          </div>
        </div>
      )}
      {phase === "review" && job && (
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          {kind !== "syllabus" && job.state === "partial" && (
            <p className={s.notice}>
              Some details need your attention. Check the course and dates
              below.
            </p>
          )}
          {/* Card 46: what was found, how, and what to do with it. */}
          {kind === "syllabus" && job.events.some((e) => e.source === "imported") && (
            <p className={s.notice}>
              {(() => {
                const found = job.events.filter((e) => e.source === "imported").length;
                return `We found ${found} ${found === 1 ? "event" : "events"} ${READ_BY[job.reader ?? "rules"]}. `;
              })()}
              Check each one against your syllabus: fix anything that’s wrong, uncheck what you don’t want, and add
              anything that’s missing.
              {job.events.some((e) => e.needsReview) && " Some details need your attention. Look for “Needs review” below."}
            </p>
          )}
          {/* A syllabus only adds events, so the note's title, date, and category don't apply. */}
          {kind !== "syllabus" && (
            <label>
              Title
              <input
                required
                value={job.metadata.title}
                onChange={(e) =>
                  setJob({
                    ...job,
                    metadata: { ...job.metadata, title: e.target.value },
                  })
                }
              />
            </label>
          )}
          <div className={kind === "syllabus" ? undefined : s.formRow}>
            <label>
              Course
              <select
                value={job.metadata.courseId}
                onChange={(e) =>
                  setJob({
                    ...job,
                    metadata: { ...job.metadata, courseId: e.target.value },
                  })
                }
              >
                {state.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                  </option>
                ))}
              </select>
            </label>
            {kind !== "syllabus" && (
              <label>
                Lecture date
                <input
                  type="date"
                  required
                  value={job.metadata.lectureDate}
                  onChange={(e) =>
                    setJob({
                      ...job,
                      metadata: { ...job.metadata, lectureDate: e.target.value },
                    })
                  }
                />
              </label>
            )}
          </div>
          {kind !== "syllabus" && (
            <label>
              Category
              <select
                value={job.metadata.category}
                onChange={(e) =>
                  setJob({
                    ...job,
                    metadata: { ...job.metadata, category: e.target.value },
                  })
                }
              >
                {["School", "Work", "Meetings", "Personal"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          {kind === "syllabus" && !job.events.length && (
            <p className={s.notice}>
              No dated events were found in this file. Add them yourself with “Add an event”, or choose another
              copy of the syllabus.
            </p>
          )}
          {/* Card 46: each event can be corrected or left out. Included events need a title and a
              date, so the browser asks for any that are missing before anything is added. */}
          {job.events.map((event, i) => {
            const included = event.include !== false;
            const update = (change: Partial<DetectedEvent>) =>
              setJob({ ...job, events: job.events.map((v, j) => (j === i ? { ...v, ...change } : v)) });
            return (
              <fieldset key={i}>
                <legend>{event.source === "manual" ? "Added by you" : `Detected ${event.kind}`}</legend>
                {event.needsReview && (
                  <p className={s.notice}>
                    {event.date
                      ? "Needs review: check this date. It isn’t written this way in your file."
                      : "Needs review: choose the date."}
                    {event.description && ` The syllabus says “${event.description}”.`}
                  </p>
                )}
                <label className={s.checkLabel}>
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={(e) => update({ include: e.target.checked })}
                  />
                  Include
                </label>
                <label>
                  Event title
                  <input
                    id={`event-title-${i}`}
                    required
                    disabled={!included}
                    value={event.title}
                    onChange={(e) => update({ title: e.target.value })}
                  />
                </label>
                <label>
                  Type
                  <select
                    disabled={!included}
                    value={event.kind}
                    onChange={(e) => update({ kind: e.target.value as EventKind })}
                  >
                    {EVENT_TYPES.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <div className={s.formRow}>
                  <label>
                    Due date
                    <input
                      type="date"
                      required
                      disabled={!included}
                      value={event.date}
                      // Choosing a date is the review, so the reminder goes away.
                      onChange={(e) => update({ date: e.target.value, needsReview: false })}
                    />
                  </label>
                  <label>
                    <span>Time <span className={s.hint}>(optional)</span></span>
                    <input
                      type="time"
                      disabled={!included}
                      value={event.time}
                      onChange={(e) => update({ time: e.target.value })}
                    />
                  </label>
                </div>
              </fieldset>
            );
          })}
          {kind === "syllabus" && (
            <>
              <div className={s.actions}>
                <button type="button" className={s.secondary} onClick={addEvent}>
                  <Plus size={16} /> Add an event
                </button>
                {!job.events.length && (
                  <button type="button" className={s.secondary} onClick={chooseAnother}>
                    Choose a different file
                  </button>
                )}
              </div>
              <p className={s.hint} aria-live="polite">
                {(() => {
                  const count = job.events.filter((e) => e.include !== false).length;
                  const course = state.courses.find((c) => c.id === job.metadata.courseId)?.code ?? "this course";
                  return count
                    ? `${count} of ${job.events.length} ${job.events.length === 1 ? "event" : "events"} will be added to ${course}.`
                    : "Include at least one event to add it to your schedule.";
                })()}
              </p>
            </>
          )}
          <button
            className={s.primary}
            disabled={busy || (kind === "syllabus" && !job.events.some((e) => e.include !== false))}
          >
            {busy
              ? "Saving…"
              : kind === "syllabus"
                ? "Add to schedule"
                : "Save to my notes"}{" "}
            <Check size={16} />
          </button>
        </form>
      )}
      {phase === "completed" && (
        <div className={s.empty}>
          <span className={s.successIcon}>
            <Check size={28} />
          </span>
          <h3>A little more organized.</h3>
          <p>
            {kind === "syllabus"
              ? "Your reviewed events are in your schedule."
              : "Your note is waiting in your library."}
          </p>
          <button className={s.primary} onClick={onClose}>
            All done
          </button>
        </div>
      )}
    </Modal>
  );
}
