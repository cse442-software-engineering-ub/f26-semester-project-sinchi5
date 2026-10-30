import type { CourseEvent } from "../domain";
import { createApiClient } from "./notes-http";

// A syllabus import job as the PHP API returns it (card 43).
export interface SyllabusJob {
  id: string;
  kind: "syllabus";
  courseId: string;
  name: string;
  type: string;
  size: number;
  state: "queued" | "processing" | "review" | "failed" | "completed";
  events: unknown[];
  createdAt: string;
}

// Syllabus uploads for signed-in accounts (card 45). The demo and other upload kinds stay in the browser.
export function createHttpSyllabus(endpoint = `${import.meta.env.BASE_URL}api/index.php`, fetcher: typeof fetch = fetch) {
  const send = createApiClient(endpoint, fetcher, "Could not reach Notely. Check your connection and try again.",
    "Uploads are unavailable right now. Please try again later.");
  return {
    async upload(file: Blob & { name: string }, courseId: string) {
      const content = await base64(file);
      // A 20 MB file can take a while on a slow connection.
      return (await send<{ job: SyllabusJob }>("syllabus-upload", { courseId, fileName: file.name, content }, 120000)).job;
    },
    // Reads a PDF, DOCX, or image job on the server, which can take a couple of minutes.
    async extract(id: string, year: number) {
      return (await send<{ job: SyllabusJob }>("import-extract", { id, year }, 180000)).job;
    },
    // Saves the reviewed events to the course (card 47). Sending it again adds nothing.
    async confirm(id: string, courseId: string, events: Pick<CourseEvent, "title" | "kind" | "date" | "time">[]) {
      return (await send<{ created: number }>("import-confirm", { id, courseId, events })).created;
    },
    // The student's imported events, for the schedule (card 48).
    async events() {
      return (await send<{ events: CourseEvent[] }>("events")).events;
    },
    // Deletes one of the student's syllabus events (card 172).
    async deleteEvent(id: string) {
      await send<{ event: { id: string } }>("event-delete", { id });
    },
  };
}
export type SyllabusApi = ReturnType<typeof createHttpSyllabus>;

async function base64(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  // Chunks keep each call under the engine's argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
