import { expect, it } from "vitest";
import { createHttpNotes, NoteServiceError } from "./notes-http";
import { dateKey, seedNotes } from "./fixtures";

type Call = { route: string; method: string; csrf?: string; body?: Record<string, unknown> };

// A stand-in for the PHP API that records each request.
function fakeApi(reply: (call: Call) => { status?: number; json: unknown }) {
  const calls: Call[] = [];
  const fetcher = (async (input: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    const call: Call = {
      route: String(input).split("?route=")[1],
      method: init.method ?? "GET",
      csrf: headers["X-CSRF-Token"],
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const { status = 200, json } = reply(call);
    return new Response(JSON.stringify(json), { status });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}
const courses = async () => [{ id: "c1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall" }];

it("lists server notes with the browser's search and sort", async () => {
  const [first, second] = seedNotes();
  const api = fakeApi(() => ({ json: { notes: [{ ...first, courseId: "other", pinned: false }, { ...second, courseId: "c1", pinned: false }] } }));
  const notes = createHttpNotes(courses, "/api/index.php", api.fetcher);
  expect((await notes.list({ q: "software engineering" })).map((n) => n.id)).toEqual([second.id]);
  expect(api.calls).toEqual([{ route: "notes", method: "GET", csrf: undefined, body: undefined }]);
});

it("asks the server for one category and still applies the other filters in the browser", async () => {
  const [first, second, third] = seedNotes();
  const notes = [
    { ...first, title: "Sprint plan", category: "Work", pinned: false },
    { ...second, title: "Sprint retro", category: "Work", pinned: false },
    { ...third, title: "Sprint notes", category: "School", pinned: false },
  ];
  // The fake server narrows by category the way the real notes list does.
  const api = fakeApi((call) => {
    const wanted = new URLSearchParams(call.route.split("&").slice(1).join("&")).get("category");
    return { json: { notes: notes.filter((n) => !wanted || n.category === wanted) } };
  });
  const repo = createHttpNotes(courses, "/api/index.php", api.fetcher);
  expect((await repo.list({ category: "Work" })).map((n) => n.title).sort()).toEqual(["Sprint plan", "Sprint retro"]);
  expect((await repo.list({ category: "Work", q: "retro" })).map((n) => n.title)).toEqual(["Sprint retro"]);
  expect(api.calls.map((call) => call.route)).toEqual(["notes&category=Work", "notes&category=Work"]);
});

it("sends no category for All categories or an unknown value, and shows nothing for the unknown one", async () => {
  const [first] = seedNotes();
  const api = fakeApi(() => ({ json: { notes: [{ ...first, category: "School", pinned: false }] } }));
  const repo = createHttpNotes(courses, "/api/index.php", api.fetcher);
  expect((await repo.list({ category: "" })).length).toBe(1);
  expect((await repo.list({})).length).toBe(1);
  expect(await repo.list({ category: "Vacation" })).toEqual([]);
  expect(api.calls.map((call) => call.route)).toEqual(["notes", "notes", "notes"]);
});

it("sends the session's CSRF token and refreshes it once after a new sign-in", async () => {
  const tokens = ["old-token", "new-token"];
  const api = fakeApi((call) => {
    if (call.route === "session") return { json: { csrfToken: tokens.shift() } };
    if (call.csrf === "old-token") return { status: 403, json: { error: "Your session changed. Reload the page and try again." } };
    return { json: { note: { id: "7" } } };
  });
  const notes = createHttpNotes(courses, "/api/index.php", api.fetcher);
  await notes.delete("7");
  expect(api.calls.map((c) => [c.route, c.csrf])).toEqual([
    ["session", undefined], ["note-delete", "old-token"], ["session", undefined], ["note-delete", "new-token"],
  ]);
  expect(api.calls[3].body).toEqual({ id: "7" });
});

it("reports the server's error, or a connection problem", async () => {
  const api = fakeApi(() => ({ status: 404, json: { error: "This note could not be found." } }));
  const error = await createHttpNotes(courses, "/api/index.php", api.fetcher).get("7").catch((e) => e);
  expect(error).toBeInstanceOf(NoteServiceError);
  expect([error.message, error.status]).toEqual(["This note could not be found.", 404]);
  expect(api.calls[0].route).toBe("note&id=7");
  const offline = createHttpNotes(courses, "/api/index.php", (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch);
  await expect(offline.list()).rejects.toThrow("Could not reach your notes.");
});

it("creates notes with the same defaults as the browser repository", async () => {
  const api = fakeApi((call) => call.route === "session" ? { json: { csrfToken: "token" } } : { status: 201, json: { note: { id: "9" } } });
  await createHttpNotes(courses, "/api/index.php", api.fetcher).create({ courseId: "c1" });
  expect(api.calls[1]).toEqual({ route: "note-create", method: "POST", csrf: "token", body: {
    title: "Untitled note", body: "", courseId: "c1", lectureDate: dateKey(), category: "School", visibility: "private", tags: [],
  } });
});
