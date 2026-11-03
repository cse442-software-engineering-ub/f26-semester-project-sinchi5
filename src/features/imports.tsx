import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  UploadCloud,
  Camera,
  FileText,
  Check,
  AlertCircle,
  LoaderCircle,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import { useApp } from "../app/context";
import { fileTypeProblem } from "../services/syllabus-file";
import { checkMeeting } from "../services/syllabus";
import { formatEventTime, Modal } from "../shared/ui";
import { CLASS_KINDS, type DetectedEvent, type DetectedMeeting, type EventKind, type UploadKind, type UploadJob } from "../domain";
import s from "../app/App.module.css";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const STEPS = ["Choose", "Read", "Check", "Done"];
const PHASE_STEP: Record<string, number> = { pick: 0, queued: 1, processing: 1, failed: 1, review: 2, completed: 3 };
// Card 46: the event types a syllabus can add, as the review screen names them.
const EVENT_TYPES: [EventKind, string][] = [["assignment", "Assignment"], ["exam", "Exam"], ["quiz", "Quiz"], ["deadline", "Deadline"], ["other", "Other"]];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const megabytes = (bytes: number) => `${Math.max(0.1, Math.round(bytes / 104857.6) / 10)} MB`;

// Card 45: Gemini reports no progress while it reads, so these keep the student company instead of a made-up
// percentage. After one pass through them, the lines say the read is still going.
const READING_LINES = [
  "Asking your syllabus nicely…",
  "Squinting at the fine print…",
  "Counting all the Mondays…",
  "Looking for midterms under the couch…",
  "Sharpening a very tiny pencil…",
  "Working out what “TBA” really means…",
  "Highlighting everything, just in case…",
  "Reading the footnotes for you…",
  "Herding your due dates…",
  "Politely skipping the office hours…",
  "Making room for your breaks…",
  "Whispering “MWF” three times…",
  "Consulting the ancient scrolls…",
  "Smoothing out page three…",
  "Asking Comic Sans to calm down…",
  "Telling your finals we’re onto them…",
  "Tiptoeing past the plagiarism policy…",
];
const LONG_READ_LINES = [
  "Still reading. This one has a lot to say…",
  "Not stuck, just thorough…",
  "Page twelve has some strong opinions…",
  "Taking notes on the notes…",
  "Still here. Still reading. Still delighted…",
];

function ReadingLine() {
  const [start] = useState(() => Math.floor(Math.random() * READING_LINES.length));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 3200);
    return () => clearInterval(timer);
  }, []);
  const line = tick < READING_LINES.length
    ? READING_LINES[(start + tick) % READING_LINES.length]
    : LONG_READ_LINES[(tick - READING_LINES.length) % LONG_READ_LINES.length];
  // Hidden from screen readers, which hear the status message once instead of every line. The key restarts
  // the highlighter swipe on each new line.
  return <p className={s.readingLine} aria-hidden="true"><span key={line}>{line}</span></p>;
}

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

// Card 46: one weekly class on the review screen. Left out, it shrinks to one line, so a long list of
// sections stays easy to scan.
function ClassReview({ meeting, index, onChange }: {
  meeting: DetectedMeeting;
  index: number;
  onChange: (change: Partial<DetectedMeeting>) => void;
}) {
  const summary = [meeting.days.map((day) => WEEKDAYS[day].slice(0, 3)).join(" "),
    meeting.time && formatEventTime(meeting.time), meeting.location].filter(Boolean).join(" · ");
  return (
    <fieldset>
      <legend>{`Detected ${meeting.kind}`}</legend>
      {meeting.include && (!meeting.starts || !meeting.ends) && (
        <p className={s.notice}>Needs review: choose when this class starts and ends.</p>
      )}
      <label className={s.checkLabel}>
        <input type="checkbox" checked={meeting.include} onChange={(e) => onChange({ include: e.target.checked })} />
        <span>Include {meeting.title}<br /><span className={s.hint}>{summary}</span></span>
      </label>
      {meeting.source && <p className={s.hint}>From your syllabus: “{meeting.source}”</p>}
      {meeting.include && (
        <>
          <label>
            Class name
            <input id={`class-title-${index}`} required value={meeting.title} onChange={(e) => onChange({ title: e.target.value })} />
          </label>
          <label>
            Type
            <select value={meeting.kind} onChange={(e) => onChange({ kind: e.target.value as DetectedMeeting["kind"] })}>
              {CLASS_KINDS.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
            </select>
          </label>
          <div role="group" aria-label="Days" className={s.dayToggles}>
            {WEEKDAYS.map((day, number) => (
              <button
                key={day}
                type="button"
                aria-label={day}
                aria-pressed={meeting.days.includes(number)}
                onClick={() => onChange({ days: meeting.days.includes(number)
                  ? meeting.days.filter((d) => d !== number) : [...meeting.days, number].sort((a, b) => a - b) })}
              >
                {day[0]}
              </button>
            ))}
          </div>
          <div className={s.formRow}>
            <label>
              <span>Time <span className={s.hint}>(optional)</span></span>
              <input type="time" value={meeting.time} onChange={(e) => onChange({ time: e.target.value })} />
            </label>
            <label>
              <span>Room <span className={s.hint}>(optional)</span></span>
              <input maxLength={120} value={meeting.location} onChange={(e) => onChange({ location: e.target.value })} />
            </label>
          </div>
          <div className={s.formRow}>
            <label>
              Starts
              <input type="date" required value={meeting.starts} onChange={(e) => onChange({ starts: e.target.value })} />
            </label>
            <label>
              Ends
              <input type="date" required value={meeting.ends} onChange={(e) => onChange({ ends: e.target.value })} />
            </label>
          </div>
        </>
      )}
    </fieldset>
  );
}

export function ImportDialog({
  kind,
  onClose,
  startingFile,
  startingCourseId,
}: {
  kind: UploadKind;
  onClose: () => void;
  startingFile?: File;
  startingCourseId?: string;
}) {
  const { repo, state, refresh } = useApp();
  const [file, setFile] = useState<File | undefined>(startingFile);
  const [job, setJob] = useState<UploadJob>();
  const [phase, setPhase] = useState(startingFile ? "queued" : "pick");
  const [importError, setImportError] = useState("");
  const [error, setError] = useState("");
  const [scenario, setScenario] = useState("success");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState({ created: 0, skipped: 0, first: "" });
  const [courseId, setCourseId] = useState(
    startingCourseId ?? state.courses[0]?.id ?? "",
  );
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
  async function run(
    result = scenario,
    sourceFile = file,
    targetCourseId = courseId,
  ) {
    if (!sourceFile) return;

    setImportError("");

    try {
      setPhase("queued");

      const [queued] = await Promise.all([
        repo.imports.start(
          sourceFile,
          kind,
          result,
          targetCourseId,
        ),
        wait(250),
      ]);

      if (!open.current) return;

      setJob(queued);
      setPhase("processing");

      const [done] = await Promise.all([
        repo.imports.process(queued, result),
        wait(900),
      ]);

      if (!open.current) return;

      setJob(done);
      setPhase(done.state === "failed" ? "failed" : "review");
    } catch (e) {
      if (!open.current) return;

      setImportError((e as Error).message);
      setPhase("failed");
    }
  }

  const startedInitialFile = useRef(false);

  useEffect(() => {
    if (!startingFile || startedInitialFile.current) return;

    startedInitialFile.current = true;

    void run(
      "success",
      startingFile,
      startingCourseId ?? courseId,
    );
  }, [startingFile, startingCourseId]);

  function chooseAnother() {
    setError("");
    setImportError("");
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
      // After a failed read the job never reached review, but the student's own events can still be saved.
      state: job.state === "partial" ? "partial" : "review",
      events: [...job.events, { id: "", courseId: job.metadata.courseId, title: "", kind: "assignment", date: "", time: "",
        location: "", description: "", source: "manual" }],
    });
    setPhase("review");
    const index = job.events.length;
    // Two frames: when the clicked button goes away, the dialog takes the focus back after the first.
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`event-title-${index}`)?.focus()));
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
    const problem = job.meetings?.filter((m) => m.include).map((m) => [m.title, checkMeeting(m, job.noClassDates)]).find(([, why]) => why);
    if (problem) {
      setError(`${problem[0]}: ${problem[1]}`);
      return;
    }
    setError("");
    setBusy(true);
    try {
      setSaved(await repo.imports.confirm(job));
      await refresh();
      setPhase("completed");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const meetings = job?.meetings ?? [];
  const foundEvents = job?.events.filter((e) => e.source === "imported").length ?? 0;
  const foundCount = foundEvents + meetings.length;
  // Nothing to show at all: no classes, no dated work, and nothing the student has added yet.
  const nothingFound = kind === "syllabus" && !!job && !job.events.length && !meetings.length;
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
      {/* On the long review screen, the error sits by the button that caused it, further down. */}
      {phase !== "review" && (error || importError) && (
        <p role="alert" className={s.error}>
          {error || importError}
        </p>
      )}
      {/* A note about these results, such as a demo's sample events (card 45). */}
      {phase === "review" && job?.notice && <p className={s.notice}>{job.notice}</p>}
      {phase === "pick" && (
        <>
          {kind === "syllabus" && (
            <p className={s.notice}>
              Choose the course, then its syllabus. Notely finds your class times and due dates and shows
              them to you first: nothing is added to your schedule until you check it.
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
                <li>For a very long syllabus, the pages with your class times and the course schedule are enough.</li>
                <li>You’ll check everything before it’s added, and you can fix or add events.</li>
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
          {kind === "syllabus" ? (
            <span className={s.readingPage} aria-hidden="true"><i /><i /><i /><i /></span>
          ) : (
            <LoaderCircle className={s.spinner} size={36} />
          )}
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
                : "Reading your syllabus carefully. This can take a minute or two."}
          </p>
          {kind === "syllabus" && <ReadingLine />}
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
      {/* Card 46: a real answer, not a failure, so it says so plainly instead of showing an empty form. */}
      {phase === "review" && job && nothingFound && (
        <div className={s.empty}>
          <FileText size={36} />
          <h3>{job.isSyllabus === false ? "This doesn’t look like a syllabus" : "No class times or due dates found"}</h3>
          <p>
            {job.isSyllabus === false
              ? `${job.name} doesn’t look like a course syllabus.`
              : `We read ${job.name}, but it doesn’t list weekly classes or dated work.`}{" "}
            Nothing was added to your schedule.
          </p>
          <div className={`${s.actions} ${s.completionActions}`}>
            <button className={s.primary} onClick={addEvent}>
              <Plus size={16} /> Add events by hand
            </button>
            <button className={s.secondary} onClick={chooseAnother}>
              Choose a different file
            </button>
            <button className={s.secondary} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
      {phase === "review" && job && !nothingFound && (
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
          {/* Card 46: what was found, and what to do with it. */}
          {kind === "syllabus" && foundCount > 0 && (
            <p className={s.notice}>
              {(() => {
                const parts = [
                  meetings.length ? `${meetings.length} weekly ${meetings.length === 1 ? "class" : "classes"}` : "",
                  foundEvents ? `${foundEvents} ${foundEvents === 1 ? "event" : "events"}` : "",
                ].filter(Boolean);
                return `We found ${parts.join(" and ")}. `;
              })()}
              Check each one against your syllabus: fix anything that’s wrong, uncheck what you don’t want, and add
              anything that’s missing.
              {(() => {
                const undated = job.events.filter((e) => e.needsReview && e.include === false).length;
                return undated ? ` ${undated} ${undated === 1 ? "has no posted date, so it starts" : "have no posted date, so they start"} unchecked.` : "";
              })()}
              {(job.events.some((e) => e.needsReview && e.include !== false) || meetings.some((m) => m.include && (!m.starts || !m.ends)))
                && " Some details need your attention. Look for “Needs review” below."}
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
          {/* Card 46: weekly classes first, then dated work, each saying if the file had none. */}
          {kind === "syllabus" && meetings.length > 0 && (
            <>
              <h3 className={s.reviewHeading}>Your classes <span className={s.hint}>repeat weekly</span></h3>
              {!!job.noClassDates?.length && (
                <p className={s.hint}>
                  No class on {job.noClassDates.map(({ from, to }) => (from === to ? shortDate(from) : `${shortDate(from)}–${shortDate(to)}`)).join(", ")}, from your syllabus.
                </p>
              )}
              {meetings.map((meeting, i) => (
                <Fragment key={i}>
                  {/* A class offered at several times: the student attends one, so none is assumed. */}
                  {meeting.section && meetings.filter((m) => m.kind === meeting.kind && m.section).length > 1
                    && !meetings.slice(0, i).some((m) => m.kind === meeting.kind && m.section) && (
                    <p className={s.reviewSubheading}>Pick your {meeting.kind} section</p>
                  )}
                  <ClassReview
                    meeting={meeting}
                    index={i}
                    onChange={(change) => setJob({ ...job, meetings: meetings.map((m, j) => (j === i ? { ...m, ...change } : m)) })}
                  />
                </Fragment>
              ))}
            </>
          )}
          {kind === "syllabus" && !meetings.length && foundEvents > 0 && (
            <p className={s.hint}>We didn’t find weekly class times in this file.</p>
          )}
          {kind === "syllabus" && meetings.length > 0 && <h3 className={s.reviewHeading}>Due dates and exams</h3>}
          {kind === "syllabus" && meetings.length > 0 && !foundEvents && (
            <p className={s.hint}>We didn’t find any dated work in this file.</p>
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
                    {included
                      ? "Needs review: choose the date."
                      : "No date is posted for this, so it won’t be added unless you include it and choose one."}
                    {event.description && ` The syllabus says “${event.description}”.`}
                  </p>
                )}
                {/* The quote lets the student check a date against the file at a glance. */}
                {!event.needsReview && event.source === "imported" && event.description && (
                  <p className={s.hint}>From your syllabus: “{event.description}”</p>
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
                <label>
                  <span>Room <span className={s.hint}>(optional)</span></span>
                  <input
                    maxLength={120}
                    disabled={!included}
                    value={event.location}
                    onChange={(e) => update({ location: e.target.value })}
                  />
                </label>
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
                  const classes = meetings.filter((m) => m.include).length;
                  const course = state.courses.find((c) => c.id === job.metadata.courseId)?.code ?? "this course";
                  const parts = [
                    classes ? `${classes} weekly ${classes === 1 ? "class" : "classes"}` : "",
                    count ? `${count} of ${job.events.length} ${job.events.length === 1 ? "event" : "events"}` : "",
                  ].filter(Boolean);
                  return parts.length
                    ? `${parts.join(" and ")} will be added to ${course}.`
                    : "Include at least one to add it to your schedule.";
                })()}
              </p>
            </>
          )}
          {error && (
            <p role="alert" className={s.error}>
              {error}
            </p>
          )}
          <button
            className={s.primary}
            disabled={busy || (kind === "syllabus" && !job.events.some((e) => e.include !== false) && !meetings.some((m) => m.include))}
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
          {/* Card 48: exactly what was added and where, and what was already there. */}
          {kind === "syllabus" && job && (() => {
            const { created, skipped } = saved;
            const course = state.courses.find((c) => c.id === job.metadata.courseId)?.code ?? "your course";
            // Neither happens when the save worked but its reply was lost, and the student sent it again.
            if (!created && !skipped) return null;
            const already = `${skipped} ${skipped === 1 ? "was" : "were"} already on your schedule.`;
            return (
              <p>
                {created
                  ? `Added ${created} ${created === 1 ? "event" : "events"} to ${course}.${skipped ? ` ${already}` : ""}`
                  : `Nothing new to add to ${course}: ${skipped === 1 ? "this event was already on your schedule." : `all ${already}`}`}
              </p>
            );
          })()}
          {/* Card 48: open the schedule on the earliest added event, so it is in view. */}
          <div className={`${s.actions} ${s.completionActions}`}>
            {kind === "syllabus" && (
              <Link
                className={s.primary}
                to={`/schedule?date=${saved.first}`}
                onClick={onClose}
              >
                View schedule <ArrowUpRight size={16} />
              </Link>
            )}
            <button className={kind === "syllabus" ? s.secondary : s.primary} onClick={onClose}>
              All done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
