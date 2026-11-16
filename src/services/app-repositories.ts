import type { AuthRepository, NoteRepository, Repositories, User } from "../domain";
import { createAuthRepository } from "./auth";
import { createHttpNotes } from "./notes-http";
import { createHttpSyllabus, type SyllabusApi } from "./imports-http";
import { createHttpCourses, type CoursesApi } from "./courses-http";
import { createRepositories } from "./repositories";
import { adoptBrowserWorkspace, workspaceKey } from "./adopt-browser-workspace";

// Card 142: everything a signed-in student keeps is on the server; nothing is stored in this browser.
export function createAppRepositories(
  serverAuth = createAuthRepository(),
  // Tests pass stand-ins for the server's notes (task #120), syllabus uploads (card 45) and courses and events (card 142).
  serverNotes: (user: User) => NoteRepository = () => createHttpNotes(async () => []),
  serverSyllabus: () => SyllabusApi = () => createHttpSyllabus(),
  serverCourses: () => CoursesApi = () => createHttpCourses(),
  // Only read for the one-time adoption of old browser data.
  storage?: Storage,
): Repositories {
  let user: User | null = null;
  let generation = 0;
  let workspace: ReturnType<typeof createRepositories> | undefined;
  let courses: CoursesApi | undefined;
  let adoption: { userId: string; done: Promise<void> } | undefined;
  function select(nextUser: User | null) {
    const previous = user;
    user = nextUser;
    if (previous && nextUser && previous.id === nextUser.id) { Object.assign(previous, nextUser); user = previous; return; }
    if (previous?.id === nextUser?.id) return;
    const notes = nextUser ? serverNotes(nextUser) : undefined;
    courses = notes ? serverCourses() : undefined;
    workspace = notes && courses ? createRepositories({ notes, syllabus: serverSyllabus(), courses }) : undefined;
  }
  // Runs once per page load for each account, before its courses and events are first listed.
  function adopt(signedIn: User) {
    if (adoption?.userId !== signedIn.id && courses) {
      adoption = { userId: signedIn.id, done: adoptBrowserWorkspace(signedIn.id, courses, storage).catch(() => undefined) };
    }
    return adoption?.done;
  }
  const forget = () => { generation++; select(null); };
  const auth: AuthRepository = {
    preferences: () => serverAuth.preferences(),
    savePreferences: (next) => serverAuth.savePreferences(next),
    async session() {
      const version = generation;
      try {
        const result = await serverAuth.session();
        if (version === generation) select(result);
        if (version === generation && user) await adopt(user);
        return user;
      } catch (error) {
        if (version !== generation) return user;
        select(null); throw error;
      }
    },
    async onboarding() { return serverAuth.onboarding(); },
    async signIn(email, password) { forget(); const result = await serverAuth.signIn(email, password); select(result); return result; },
    async signUp(name, email, password) { forget(); const result = await serverAuth.signUp(name, email, password); select(result.user); return result; },
    async signOut() { await serverAuth.signOut(); forget(); },
    async completeOnboarding() { await serverAuth.completeOnboarding(); },
    async updateProfile(name, email, password) { const result = await serverAuth.updateProfile(name, email, password); select(result); return result; },
    async changePassword(currentPassword, password) { await serverAuth.changePassword(currentPassword, password); },
    async uploadProfilePhoto(content) { const result = await serverAuth.uploadProfilePhoto(content); select(result); return result; },
    async removeProfilePhoto() { const result = await serverAuth.removeProfilePhoto(); select(result); return result; },
    async resetPassword(email, recoveryCode, password) { forget(); const code = await serverAuth.resetPassword(email, recoveryCode, password); select(null); return code; },
    async replaceRecoveryCode(password) { return serverAuth.replaceRecoveryCode(password); },
    async deleteAccount(password) {
      await serverAuth.deleteAccount(password);
      const deleted = user;
      forget();
      // Old browser data of a deleted account is never adopted, so it goes too.
      if (deleted) {
        try { (storage ?? localStorage).removeItem(workspaceKey(deleted.id)); }
        catch { /* The server account is already deleted; never leave it signed in. */ }
      }
    },
  };
  // Each call uses the current account's workspace, never one left over from another account.
  function proxy<K extends "courses" | "notes" | "schedule" | "imports">(key: K): Repositories[K] {
    return new Proxy({} as Repositories[K], {
      get(_target, method) {
        return (...args: unknown[]) => {
          if (!workspace) return Promise.reject(new Error("Sign in to continue."));
          const target = workspace[key] as unknown as Record<string | symbol, (...values: unknown[]) => unknown>;
          return target[method](...args);
        };
      },
    });
  }
  return {
    auth,
    courses: proxy("courses"), notes: proxy("notes"), schedule: proxy("schedule"), imports: proxy("imports"),
    async reset() {
      if (!user || !workspace || !courses) throw new Error("Sign in to continue.");
      await courses.clearWorkspace();
    },
  };
}
