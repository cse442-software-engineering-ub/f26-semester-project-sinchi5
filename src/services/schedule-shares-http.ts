import type { ScheduleShare, CollaboratorPermission } from "../domain";
import { createApiClient } from "./notes-http";

// Card 144: the schedule-sharing routes from card 143. Only the course's owner can list, share, or stop sharing.
// A reply without the expected list counts as an empty one, so the window never breaks on it.
export function createHttpScheduleShares(endpoint = `${import.meta.env.BASE_URL}api/index.php`, fetcher: typeof fetch = fetch) {
  const send = createApiClient(endpoint, fetcher, "Could not reach Notely. Check your connection and try again.",
    "Sharing is unavailable right now. Please try again later.");
  return {
    list: async (courseId: string) =>
      (await send<{ shares?: ScheduleShare[] }>(`schedule-shares&courseId=${encodeURIComponent(courseId)}`)).shares ?? [],
    share: async (courseId: string, email: string, permission: CollaboratorPermission = "view") =>
      (await send<{ share: ScheduleShare }>("schedule-share", { courseId, email, permission })).share,
    setPermission: async (courseId: string, userId: string, permission: CollaboratorPermission) =>
      (await send<{ share: ScheduleShare }>("schedule-permission", { courseId, userId, permission })).share,
    // Resolves to who still has the schedule.
    unshare: async (courseId: string, userId: string) =>
      (await send<{ shares?: ScheduleShare[] }>("schedule-unshare", { courseId, userId })).shares ?? [],
  };
}
export type ScheduleSharesApi = ReturnType<typeof createHttpScheduleShares>;
