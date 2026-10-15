import { useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  Camera,
  FileText,
  Check,
  AlertCircle,
  LoaderCircle,
} from "lucide-react";
import { useApp } from "../app/context";
import { Modal } from "../shared/ui";
import type { UploadKind, UploadJob } from "../domain";
import s from "../app/App.module.css";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
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
      const [done] = await Promise.all([repo.imports.process(queued, file, result), wait(900)]);
      if (!open.current) return;
      setJob(done);
      setPhase(done.state === "failed" ? "failed" : "review");
    } catch (e) {
      // The file was uploaded but couldn't be read (a daily limit, for example), so offer another try.
      if (open.current) {
        setError((e as Error).message);
        setPhase("failed");
      }
    }
  }
  function pick(f?: File) {
    if (!f) return;
    const invalid = repo.imports.validate(f, kind);
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
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {phase === "pick" && (
        <>
          {kind === "syllabus" &&
            (state.courses.length ? (
              <div className={s.form}>
                <label>
                  Course
                  <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                    {state.courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <p className={s.notice}>Add a course in Settings before uploading its syllabus.</p>
            ))}
          <label
            className={s.dropzone}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files[0]);
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
            <input
              type="file"
              aria-label="Choose upload file"
              accept={
                kind === "scan"
                  ? "image/jpeg,image/png,image/webp"
                  : ".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp"
              }
              capture={kind === "scan" ? "environment" : undefined}
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </label>
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
          <button
            className={s.primary}
            disabled={!file || (kind === "syllabus" && !courseId)}
            onClick={() => void run()}
          >
            Continue <FileText size={16} />
          </button>
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
          <p>Organizing your notes, one detail at a time.</p>
        </div>
      )}
      {phase === "failed" && (
        <div className={s.empty}>
          <AlertCircle size={36} />
          <h3>That file needs another try</h3>
          <p>We couldn’t process this upload. Your existing notes are safe.</p>
          <button
            className={s.primary}
            onClick={() => {
              setScenario("success");
              void run("success");
            }}
          >
            Try again
          </button>
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
          {job.state === "partial" && (
            <p className={s.notice}>
              Some details need your attention. Check the course and dates
              below.
            </p>
          )}
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
          <div className={s.formRow}>
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
            <label>
              {kind === "syllabus" ? "Review date" : "Lecture date"}
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
          </div>
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
          {job.events.map((event, i) => (
            <fieldset key={i}>
              <legend>Detected {event.kind}</legend>
              <label>
                Event title
                <input
                  required
                  value={event.title}
                  onChange={(e) =>
                    setJob({
                      ...job,
                      events: job.events.map((v, j) =>
                        j === i ? { ...v, title: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
              <div className={s.formRow}>
                <label>
                  Due date
                  <input
                    type="date"
                    required
                    value={event.date}
                    onChange={(e) =>
                      setJob({
                        ...job,
                        events: job.events.map((v, j) =>
                          j === i ? { ...v, date: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Time
                  <input
                    type="time"
                    value={event.time}
                    onChange={(e) =>
                      setJob({
                        ...job,
                        events: job.events.map((v, j) =>
                          j === i ? { ...v, time: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
              </div>
            </fieldset>
          ))}
          <button className={s.primary} disabled={busy}>
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
