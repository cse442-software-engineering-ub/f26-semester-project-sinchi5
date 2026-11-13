import type { FriendLists } from "../domain";
import { createApiClient } from "./notes-http";

// Card 154: the friend routes from card 153. Every reply carries the updated lists.
export function createHttpFriends(endpoint = `${import.meta.env.BASE_URL}api/index.php`, fetcher: typeof fetch = fetch) {
  const send = createApiClient(endpoint, fetcher, "Could not reach your friends. Check your connection and try again.",
    "Your friends list is unavailable. Please try again later.");
  return {
    list: () => send<FriendLists>("friends"),
    request: (email: string) => send<FriendLists>("friend-request", { email }),
    respond: (id: string, accept: boolean) => send<FriendLists>("friend-respond", { id, accept }),
    remove: (id: string) => send<FriendLists>("friend-remove", { id }),
  };
}
