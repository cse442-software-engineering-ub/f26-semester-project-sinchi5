import { expect, it, vi } from "vitest";
import type { AuthRepository, User } from "../domain";
import { createAppRepositories } from "./app-repositories";
function memory(): Storage {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); }, clear: () => data.clear(), key: index => [...data.keys()][index], get length() { return data.size; } };
}
const alice = { id: "1", name: "Alice", email: "alice@example.edu" };
const bob = { id: "2", name: "Bob", email: "bob@example.edu" };
it("rejects legacy localStorage identity and keeps demo independent of server accounts", async () => {
  const storage = memory(); const tab = memory();
  storage.setItem("notely-data-v1", JSON.stringify({ user: alice, completed: true, notes: [], courses: [] }));
  const session = vi.fn().mockResolvedValue(null);
  const repo = createAppRepositories(storage, tab, { session } as unknown as AuthRepository);
  expect(await repo.auth.session()).toBeNull();
  await expect(repo.notes.list()).rejects.toThrow("Sign in");
  await repo.auth.startDemo();
  expect((await repo.auth.session())?.id).toBe("student");
  expect(session).toHaveBeenCalledTimes(1);
  expect(JSON.parse(storage.getItem("notely-data-v1")!)).not.toHaveProperty("user");
  await repo.auth.signOut();
  expect(tab.getItem("notely-demo")).toBeNull();
});
it("isolates account workspaces and does not persist account or credential data", async () => {
  const storage = memory(); let current: User | null = alice;
  const auth = { session: async () => current, signOut: async () => { current = null; }, deleteAccount: async () => { current = null; } } as unknown as AuthRepository;
  const repo = createAppRepositories(storage, memory(), auth);
  await repo.auth.session();
  const note = await repo.notes.create({ title: "Alice only" });
  expect(note.ownerId).toBe("1");
  expect(JSON.parse(storage.getItem("notely-workspace-v1-1")!)).not.toHaveProperty("user");
  current = bob; await repo.auth.session();
  expect((await repo.notes.list()).some(n => n.title === "Alice only")).toBe(false);
  current = alice; await repo.auth.session();
  expect((await repo.notes.get(note.id)).title).toBe("Alice only");
  await repo.reset();
  expect((await repo.notes.create({})).ownerId).toBe("1");
  await repo.auth.deleteAccount("current password");
  expect(storage.getItem("notely-workspace-v1-1")).toBeNull();
  await expect(repo.notes.list()).rejects.toThrow("Sign in");
});
it("clears selected workspace on server failure", async () => {
  const session = vi.fn().mockResolvedValueOnce(alice).mockRejectedValueOnce(new Error("unavailable"));
  const repo = createAppRepositories(memory(), memory(), { session } as unknown as AuthRepository);
  await repo.auth.session();
  await expect(repo.auth.session()).rejects.toThrow("unavailable");
  await expect(repo.notes.list()).rejects.toThrow("Sign in");
});
it("ignores an older server refresh after switching into the demo", async () => {
  let finish!: (user: User | null) => void;
  const session = () => new Promise<User | null>(resolve => { finish = resolve; });
  const repo = createAppRepositories(memory(), memory(), { session } as unknown as AuthRepository);
  const earlier = repo.auth.session();
  await repo.auth.startDemo();
  finish(null);
  expect((await earlier)?.id).toBe("student");
  expect(await repo.notes.list()).toHaveLength(6);
});
it("starts real accounts with an empty workspace while the demo keeps sample content", async () => {
  const repo = createAppRepositories(memory(), memory(), { session: async () => alice } as unknown as AuthRepository);
  await repo.auth.session();
  expect(await repo.courses.list()).toEqual([]);
  expect(await repo.notes.list()).toEqual([]);
  await repo.reset();
  expect(await repo.courses.list()).toEqual([]);
  await repo.auth.startDemo();
  expect((await repo.courses.list()).length).toBeGreaterThan(0);
});
