import { describe, expect, it, vi } from "vitest";
import { createAuthRepository } from "./auth";
const anonymous = { user: null, onboarding: { completed: false, step: 0 }, csrfToken: "csrf-before" };
const user = { id: "42", name: "Jamie", email: "jamie@example.edu", hasPhoto: false };
const signedIn = { ...anonymous, user, csrfToken: "csrf-after" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
describe("PHP account adapter", () => {
  it("uploads raw base64 and removes photos with session credentials and rotated CSRF", async () => {
    const withPhoto = { ...user, hasPhoto: true };
    const fetcher = vi.fn().mockResolvedValueOnce(json(signedIn))
      .mockResolvedValueOnce(json({ ...signedIn, user: withPhoto, csrfToken: "photo-csrf" }))
      .mockResolvedValueOnce(json(signedIn));
    const repo = createAuthRepository("/class/api/index.php", fetcher);
    expect(await repo.uploadProfilePhoto("iVBORw0KGgo=")).toEqual(withPhoto);
    expect(fetcher.mock.calls[1][0]).toBe("/class/api/index.php?route=profile-photo");
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "POST", credentials: "same-origin",
      headers: { "X-CSRF-Token": "csrf-after" }, body: JSON.stringify({ content: "iVBORw0KGgo=" }) });
    expect(await repo.removeProfilePhoto()).toEqual(user);
    expect(fetcher.mock.calls[2][0]).toBe("/class/api/index.php?route=profile-photo-remove");
    expect(fetcher.mock.calls[2][1]).toMatchObject({ method: "POST", credentials: "same-origin",
      headers: { "X-CSRF-Token": "photo-csrf" }, body: "{}" });
  });
  it("preserves specific photo errors and permits retrying with the current CSRF token", async () => {
    const message = "This image could not be read. Try another file.";
    const fetcher = vi.fn().mockResolvedValueOnce(json(signedIn))
      .mockResolvedValueOnce(json({ error: message }, 422)).mockResolvedValueOnce(json({ ...signedIn, user: { ...user, hasPhoto: true } }));
    const repo = createAuthRepository("/api/index.php", fetcher);
    await expect(repo.uploadProfilePhoto("bad")).rejects.toMatchObject({ message, status: 422 });
    expect((await repo.uploadProfilePhoto("retry")).hasPhoto).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2][1].headers["X-CSRF-Token"]).toBe("csrf-after");
  });
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
