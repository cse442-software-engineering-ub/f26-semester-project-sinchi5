import type { AuthRepository, Repositories, User } from "../domain";
import { createAuthRepository } from "./auth";
import { createRepositories } from "./repositories";

export function createAppRepositories(storage: Storage, tabStorage: Storage, serverAuth = createAuthRepository()): Repositories {
  let demo = tabStorage.getItem("notely-demo") === "true";
  let user: User | null = null;
  let activeId = "";
  let generation = 0;
  let workspace = createRepositories();
  function select(nextUser: User | null) {
    const previous = user;
    user = nextUser;
    const id = demo ? "demo" : nextUser?.id || "";
    if (id === activeId) {
      if (previous && nextUser) { Object.assign(previous, nextUser); user = previous; }
      return;
    }
    activeId = id;
    // Prototype content is separated per account; it is not server-backed private storage.
    const key = demo ? "notely-data-v1" : `notely-workspace-v1-${id}`;
    const adapter = id ? {
      getItem: () => storage.getItem(key),
      setItem: (_key: string, value: string) => {
        const { user: _user, completed: _completed, ...data } = JSON.parse(value);
        storage.setItem(key, JSON.stringify(data));
      },
    } : undefined;
    workspace = createRepositories(adapter, nextUser);
  }
  const demoUser: User = { id: "student", name: "Erin", email: "demo@example.edu" };
  const leaveDemo = () => { generation++; demo = false; tabStorage.removeItem("notely-demo"); select(null); };
  const auth: AuthRepository = {
    async session() {
      const version = generation;
      try {
        const result = demo ? demoUser : await serverAuth.session();
        if (version === generation) select(result);
        return user;
      } catch (error) {
        if (version !== generation) return user;
        select(null); throw error;
      }
    },
    async onboarding() { return demo ? { completed: true, step: 3 } : serverAuth.onboarding(); },
    async startDemo() {
      generation++; demo = true; tabStorage.setItem("notely-demo", "true"); select(demoUser);
      await workspace.auth.startDemo();
    },
    async signIn(email, password) { leaveDemo(); const result = await serverAuth.signIn(email, password); select(result); return result; },
    async signUp(name, email, password) { leaveDemo(); const result = await serverAuth.signUp(name, email, password); select(result.user); return result; },
    async signOut() { if (!demo) await serverAuth.signOut(); leaveDemo(); },
    async completeOnboarding() { if (!demo) await serverAuth.completeOnboarding(); },
    async updateProfile(name, email, password) { const result = await serverAuth.updateProfile(name, email, password); select(result); return result; },
    async changePassword(currentPassword, password) { await serverAuth.changePassword(currentPassword, password); },
    async resetPassword(email, recoveryCode, password) { leaveDemo(); const code = await serverAuth.resetPassword(email, recoveryCode, password); select(null); return code; },
    async replaceRecoveryCode(password) { return serverAuth.replaceRecoveryCode(password); },
    async deleteAccount(password) {
      await serverAuth.deleteAccount(password);
      const deletedUser = user;
      select(null);
      if (deletedUser) {
        try { storage.removeItem(`notely-workspace-v1-${deletedUser.id}`); }
        catch { /* The server account is already deleted; never leave it signed in. */ }
      }
    },
  };
  // Each call uses the current workspace, never a repository left over from another account.
  function proxy<K extends "courses" | "notes" | "schedule" | "imports">(key: K): Repositories[K] {
    return new Proxy({} as Repositories[K], {
      get(_target, method) {
        return (...args: unknown[]) => {
          if (!activeId) return Promise.reject(new Error("Sign in to continue."));
          const target = workspace[key] as unknown as Record<string | symbol, (...values: unknown[]) => unknown>;
          return target[method](...args);
        };
      },
    });
  }
  return {
    auth,
    courses: proxy("courses"), notes: proxy("notes"), schedule: proxy("schedule"), imports: proxy("imports"),
    async reset() { await workspace.reset(); if (demo) leaveDemo(); },
  };
}
