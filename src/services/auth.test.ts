import { describe, expect, it, vi } from "vitest";
import { createAuthRepository } from "./auth";
const anonymous = { user: null, onboarding: { completed: false, step: 0 }, csrfToken: "csrf-before" };
const user = { id: "42", name: "Jamie", email: "jamie@example.edu" };
const signedIn = { ...anonymous, user, csrfToken: "csrf-after" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
describe("PHP account adapter", () => {
  it("bootstraps CSRF before registration, sends passwords only in the body, and uses rotated CSRF", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(anonymous))
      .mockResolvedValueOnce(json({ ...signedIn, recoveryCode: "one-time-code" }))
      .mockResolvedValueOnce(json(signedIn));
    const repo = createAuthRepository("/class/api/index.php", fetcher);
    expect(await repo.signUp("Jamie", "jamie@example.edu", "Sample meadow password 42!")).toEqual({ user, recoveryCode: "one-time-code" });
    expect(fetcher.mock.calls[1][0]).toBe("/class/api/index.php?route=register");
    expect(fetcher.mock.calls[1][1]).toMatchObject({ credentials: "same-origin", cache: "no-store", headers: { "X-CSRF-Token": "csrf-before" } });
    await repo.completeOnboarding();
    expect(fetcher.mock.calls[2][1].headers["X-CSRF-Token"]).toBe("csrf-after");
    expect(fetcher.mock.calls[2][1].body).not.toContain("one-time-code");
  });
  it("refreshes the session after a rejected CSRF token without replaying the mutation", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(anonymous)).mockResolvedValueOnce(json({ error: "Session changed" }, 403))
      .mockResolvedValueOnce(json({ ...anonymous, csrfToken: "new-csrf" })).mockResolvedValueOnce(json(signedIn));
    const repo = createAuthRepository("/api/index.php", fetcher);
    await expect(repo.signIn(user.email, "incorrect")).rejects.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await repo.signIn(user.email, "correct");
    expect(fetcher.mock.calls[3][1].headers["X-CSRF-Token"]).toBe("new-csrf");
  });
  it("reports offline and non-JSON responses without creating a local account", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(new Response("<html>unavailable</html>"));
    const repo = createAuthRepository("/api/index.php", fetcher);
    await expect(repo.session()).rejects.toThrow("connection");
    await expect(repo.signIn(user.email, "password")).rejects.toThrow("unavailable");
  });
  it("deduplicates concurrent session requests and sends recovery codes only in POST bodies", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(anonymous)).mockResolvedValueOnce(json({ ...anonymous, recoveryCode: "replacement" }));
    const repo = createAuthRepository("/api/index.php", fetcher);
    await Promise.all([repo.session(), repo.session()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await repo.resetPassword(user.email, "original", "New meadow password 42!")).toBe("replacement");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ email: user.email, recoveryCode: "original", password: "New meadow password 42!" });
  });
});
