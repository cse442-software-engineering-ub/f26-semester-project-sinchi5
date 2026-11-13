import type { CourseShare, Note } from "../domain";
import { createApiClient } from "./notes-http";

// Card 157: the course-sharing routes from card 156. A course's list is replaced as a whole.
// A reply without the expected list counts as an empty one, so the page never breaks on it.
export function createHttpNoteShares(endpoint = `${import.meta.env.BASE_URL}api/index.php`, fetcher: typeof fetch = fetch) {
  const send = createApiClient(endpoint, fetcher, "Could not reach your notes. Check your connection and try again.",
    "Sharing is unavailable right now. Please try again later.");
  return {
    shares: async (courseId: string) =>
      (await send<{ shares?: CourseShare[] }>(`course-notes-shares&courseId=${encodeURIComponent(courseId)}`)).shares ?? [],
    share: async (courseId: string, courseCode: string, friendIds: string[]) =>
      (await send<{ shares?: CourseShare[] }>("course-notes-share", { courseId, courseCode, friendIds })).shares ?? [],
    // Card 158: every note in a course a friend shared with this student, newest first.
    sharedWithMe: async () => (await send<{ notes?: Note[] }>("shared-notes")).notes ?? [],
  };
}
