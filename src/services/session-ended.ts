// Card 258: a signed-in API call answered 401, so the app should re-check the session and show the log-in page.
const listeners = new Set<() => void>();
export const onUnauthorized = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const reportUnauthorized = () => listeners.forEach((fn) => fn());
