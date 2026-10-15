import { expect, it } from "vitest";
import { createHttpSyllabus } from "./imports-http";
import { NoteServiceError } from "./notes-http";

type Call = { route: string; method: string; csrf?: string; body?: Record<string, unknown> };

// A stand-in for the PHP API that records each request; nothing leaves the test.
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
const job = { id: "12", kind: "syllabus", courseId: "c1", name: "cse442-syllabus.txt", type: "txt", size: 4, state: "queued", events: [] };

it("uploads the file as base64 with its name and course, using the session's CSRF token (card 45)", async () => {
  const api = fakeApi((call) => (call.route === "session" ? { json: { csrfToken: "token" } } : { status: 201, json: { job } }));
  const syllabus = createHttpSyllabus("/api/index.php", api.fetcher);
  const bytes = new Uint8Array(70000).map((_, i) => i % 256);
  expect(await syllabus.upload(new File([bytes], "cse442-syllabus.txt"), "c1")).toEqual(job);
  expect(api.calls.map((c) => [c.route, c.method, c.csrf])).toEqual([["session", "GET", undefined], ["syllabus-upload", "POST", "token"]]);
  const body = api.calls[1].body!;
  expect([body.courseId, body.fileName]).toEqual(["c1", "cse442-syllabus.txt"]);
  // Larger than one 32 KB chunk, so the chunked encoding must join correctly.
  expect(Uint8Array.from(atob(String(body.content)), (c) => c.charCodeAt(0))).toEqual(bytes);
});

it("asks the server to read a job for the course year and passes on its messages (card 45)", async () => {
  const api = fakeApi((call) => {
    if (call.route === "session") return { json: { csrfToken: "token" } };
    if (call.body?.id === "13") return { status: 429, json: { error: "You can read 5 syllabi automatically each day. Try again tomorrow, or upload a TXT version." } };
    return { json: { job: { ...job, state: "review", events: [{ title: "Quiz 1" }] } } };
  });
  const syllabus = createHttpSyllabus("/api/index.php", api.fetcher);
  expect((await syllabus.extract("12", 2026)).events).toEqual([{ title: "Quiz 1" }]);
  expect(api.calls[1]).toMatchObject({ route: "import-extract", body: { id: "12", year: 2026 } });
  const limited = syllabus.extract("13", 2026);
  await expect(limited).rejects.toThrow("You can read 5 syllabi automatically each day.");
  await expect(limited).rejects.toBeInstanceOf(NoteServiceError);
  const offline = createHttpSyllabus("/api/index.php", (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch);
  await expect(offline.extract("12", 2026)).rejects.toThrow("Could not reach Notely. Check your connection and try again.");
});
