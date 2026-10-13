import type { AuthRepository, OnboardingState, User } from "../domain";

type Session = { user: User | null; onboarding: OnboardingState; csrfToken: string; recoveryCode?: string };
export class AccountError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function createAuthRepository(
  endpoint = `${import.meta.env.BASE_URL}api/index.php`,
  fetcher: typeof fetch = fetch,
): AuthRepository {
  let snapshot: Session | undefined;
  let pending: Promise<Session> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  function request(route: string, data?: Record<string, string>): Promise<Session> {
    const next = queue.then(() => send(route, data));
    queue = next.catch(() => undefined);
    return next;
  }
  async function send(route: string, data?: Record<string, string>): Promise<Session> {
    let response: Response;
    try {
      response = await fetcher(`${endpoint}?route=${route}`, {
        method: data ? "POST" : "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        headers: data ? { "Content-Type": "application/json", "X-CSRF-Token": snapshot?.csrfToken || "" } : {},
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
    } catch {
      throw new AccountError("Could not reach the account service. Check your connection and try again.", 0);
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) snapshot = undefined;
      throw new AccountError(body?.error || "The account service is unavailable. Please try again later.", response.status);
    }
    if (!body || typeof body.csrfToken !== "string" || !body.onboarding || !("user" in body)) {
      throw new AccountError("The account service is unavailable. Please try again later.", 503);
    }
    // Recovery codes are returned only to the caller and never kept in the session cache.
    const { recoveryCode: _code, ...session } = body as Session;
    snapshot = session;
    return body as Session;
  }
  async function read() {
    if (!pending) pending = request("session").finally(() => { pending = undefined; });
    return pending;
  }
  async function post(route: string, data: Record<string, string> = {}) {
    if (!snapshot) await read();
    return request(route, data);
  }
  return {
    async session() { return (await read()).user; },
    async onboarding() { return (snapshot || await read()).onboarding; },
    async signIn(email, password) { return (await post("login", { email, password })).user!; },
    async signUp(name, email, password) {
      const result = await post("register", { name, email, password });
      return { user: result.user!, recoveryCode: result.recoveryCode! };
    },
    async signOut() { await post("logout"); },
    async startDemo() { throw new Error("Demo access is handled separately from accounts."); },
    async completeOnboarding() { await post("onboarding"); },
    async updateProfile(name, email, currentPassword) {
      return (await post("profile", { name, email, currentPassword })).user!;
    },
    async changePassword(currentPassword, password) { await post("password", { currentPassword, password }); },
    async resetPassword(email, recoveryCode, password) {
      return (await post("reset-password", { email, recoveryCode, password })).recoveryCode!;
    },
    async replaceRecoveryCode(currentPassword) { return (await post("recovery-code", { currentPassword })).recoveryCode!; },
    async deleteAccount(currentPassword) { await post("delete", { currentPassword }); },
  };
}
