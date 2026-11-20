// Frontend test: the People panel's collaborators and comments come from the server routes (API replaced).
import "@fontsource-variable/inter";
import "../../../src/app/tokens.css";
import "../../../src/app/global.css";
import "../styles";
import "../../../src/app/shell.module.css";
import { MemoryRouter } from "react-router-dom";
import { page, test, expect } from "../../shared/runner.js";
import { mount, stubApi, byRole, click, waitFor, pageScrollWidth } from "../harness";
import { Provider } from "../../../src/app/context";
import App from "../../../src/app/App";

page({ card: "247", title: "Frontend: Real collaborators and comments", kind: "frontend" });

const user = (id: string, name: string) => ({ id, name, email: `${name.split(" ")[0].toLowerCase()}@example.edu`, hasPhoto: false });
const ada = user("1", "Ada Lovelace");
const grace = user("2", "Grace Hopper");
const alan = user("3", "Alan Turing");
const session = (u: typeof ada) => ({ user: u, onboarding: { completed: true, step: 3 }, csrfToken: "test-token" });
const cse442 = { id: "c1", code: "CSE 442", name: "Software Engineering", color: "#869D7A", term: "Fall 2026" };
const note = {
  id: "n1", ownerId: "1", courseId: "c1", title: "Week 3 lecture", body: "<p>Hello</p>", format: "html", excerpt: "", lectureDate: "2026-09-01",
  category: "School", tags: [], pinned: false, visibility: "shared", createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-01T12:00:00Z", remindAt: null,
};
const person = (u: typeof ada, permission = "view") => ({ id: u.id, name: u.name, email: u.email, permission });
const friend = (u: typeof ada, id: string) => ({ id, userId: u.id, name: u.name, email: u.email });
const comment = (id: string, u: typeof ada, body: string, at: string) => ({ id, noteId: "n1", body, author: u.name, authorId: u.id, createdAt: at });
const comments = [comment("c1", grace, "Is the midterm on week 6?", "2026-09-02T10:00:00Z"), comment("c2", ada, "Yes, week 6.", "2026-09-02T11:30:00Z")];
const PEOPLE = "src/features/collaborators.tsx → Collaborators";
const COMMENTS = "src/features/comments.tsx → Comments";
const EDITOR = "src/features/note-editor.tsx → NoteEditor (canEdit)";

let api: ReturnType<typeof stubApi>;
const open = async (width: number, extra: Record<string, unknown> = {}, who = ada) => {
  api = stubApi({
    session: session(who), notes: { notes: [note] }, events: { events: [] }, courses: { courses: [cse442] }, "course-notes-shares": { shares: [] },
    "shared-notes": { notes: [] }, friends: { friends: [friend(grace, "f1"), friend(alan, "f2")], incoming: [], outgoing: [] },
    note: { note }, "note-versions": { versions: [] }, "note-collaborators": { collaborators: [] }, "note-comments": { comments }, ...extra,
  });
  const root = mount(<MemoryRouter initialEntries={["/notes/n1"]}><Provider><App /></Provider></MemoryRouter>, { width });
  Object.assign(root.ownerDocument.body.style, { maxWidth: "none", padding: "0" });
  await waitFor(() => root.querySelector(".ProseMirror") && byRole("button", "Save"));
  await click(byRole("button", "People"));
  return root;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const doc = () => ([...document.querySelectorAll("iframe")].at(-1)?.contentDocument ?? document);
const control = (label: string) => [...doc().querySelectorAll<HTMLSelectElement | HTMLTextAreaElement>("select,textarea")]
  .find((e) => (e.getAttribute("aria-label") ?? doc().querySelector(`label[for="${e.id}"]`)?.textContent ?? e.closest("label")?.firstChild?.textContent)?.trim() === label) ?? null;
const button = (label: string) => [...doc().querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent)?.trim() === label) ?? null;
const choose = async (el: HTMLSelectElement | null, value: string) => {
  el!.value = value;
  el!.dispatchEvent(new Event("change", { bubbles: true }));
  await wait(0);
};
// The harness's type() uses this window's prototypes; the screen lives in an iframe, so use its own.
const type = async (el: HTMLTextAreaElement | null, value: string) => {
  const proto = (el!.ownerDocument.defaultView as any).HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el!.dispatchEvent(new Event("input", { bubbles: true }));
  await wait(0);
};
const rows = () => [...doc().querySelectorAll('section[aria-label="Collaborators"] li')].map((li) => li.textContent ?? "");
const commentTexts = () => [...doc().querySelectorAll("article")].map((a) => a.querySelector("p")?.textContent);

await test("1. Friends are not offered for invite, or the invite still asks for a typed email", PEOPLE, async () => {
  await open(1440);
  const pick = await waitFor(() => (control("Invite a friend")?.options.length ?? 0) > 1 && control("Invite a friend")!);
  expect([...pick.options].map((o) => o.textContent)).toEqual(["Choose a friend", "Grace Hopper", "Alan Turing"]);
  expect(doc().querySelector('input[type="email"]')).toBe(null);
  expect((button("Invite") as HTMLButtonElement).disabled).toBe(true);
});
await test("2. Inviting a friend does not post note-invite with their email, list them, or take them off the picker", PEOPLE, async () => {
  await open(1440, { "note-invite": { collaborator: person(grace) } });
  await waitFor(() => (control("Invite a friend")?.options.length ?? 0) > 1);
  await choose(control("Invite a friend") as HTMLSelectElement, "2");
  await click(button("Invite"));
  const sent = await waitFor(() => api.sent.find((r) => r.route === "note-invite"));
  expect([sent.body, sent.method, sent.csrf]).toEqual([{ id: "n1", email: "grace@example.edu" }, "POST", "test-token"]);
  await waitFor(() => rows().length === 1);
  expect(rows()[0]).toContain("Grace Hopper");
  expect([...(control("Invite a friend") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Choose a friend", "Alan Turing"]);
});
await test("3. The server's \"friends only\" refusal is not shown beside the invite, or a person is listed anyway", PEOPLE, async () => {
  await open(1440, { "note-invite": { status: 422, body: { error: "You can invite only your friends to a note." } } });
  await waitFor(() => (control("Invite a friend")?.options.length ?? 0) > 1);
  await choose(control("Invite a friend") as HTMLSelectElement, "3");
  await click(button("Invite"));
  const alert = await waitFor(() => doc().querySelector('section[aria-label="Collaborators"] [role=alert]'));
  expect([alert.textContent, rows().length]).toEqual(["You can invite only your friends to a note.", 0]);
});
await test("4. The owner cannot change a permission or remove a collaborator through the server", PEOPLE, async () => {
  await open(1440, {
    "note-collaborators": { collaborators: [person(grace), person(alan, "edit")] },
    "note-permission": (req: any) => ({ collaborator: person(grace, req.body.permission) }),
    "note-collaborator-remove": (req: any) => ({ collaborator: { id: req.body.userId } }),
  });
  const select = await waitFor(() => control("Permission for Grace Hopper") as HTMLSelectElement);
  await choose(select, "edit");
  const sent = await waitFor(() => api.sent.find((r) => r.route === "note-permission"));
  expect(sent.body).toEqual({ id: "n1", userId: "2", permission: "edit" });
  await waitFor(() => (control("Permission for Grace Hopper") as HTMLSelectElement).value === "edit");
  await click(button("Remove Alan Turing"));
  const removed = await waitFor(() => api.sent.find((r) => r.route === "note-collaborator-remove"));
  expect(removed.body).toEqual({ id: "n1", userId: "3" });
  await waitFor(() => rows().length === 1);
  expect(rows()[0]).toContain("Grace Hopper");
});
await test("5. A collaborator has no permission select or Remove, or \"Leave this note\" does not remove them and close the note", PEOPLE, async () => {
  await open(1440, {
    "note-collaborators": { collaborators: [person(grace, "edit"), person(alan)] },
    "note-collaborator-remove": { collaborator: { id: "2" } }, notes: { notes: [] },
  }, grace);
  await waitFor(() => button("Leave this note"));
  expect([doc().querySelectorAll('section[aria-label="Collaborators"] select').length, [...doc().querySelectorAll("button")].some((b) => b.textContent === "Remove")]).toEqual([0, false]);
  expect(doc().querySelector("#invite-friend")).toBe(null);
  await click(button("Leave this note"));
  const sent = await waitFor(() => api.sent.find((r) => r.route === "note-collaborator-remove"));
  expect(sent.body).toEqual({ id: "n1", userId: "2" });
  await waitFor(() => !byRole("button", "People"));
});
await test("6. Comments are not listed oldest first with author and time, or Delete shows where the rules say it must not", COMMENTS, async () => {
  await open(1440, { "note-collaborators": { collaborators: [person(grace)] } }, grace);
  await waitFor(() => commentTexts().length === 2);
  expect(commentTexts()).toEqual(["Is the midterm on week 6?", "Yes, week 6."]);
  expect([...doc().querySelectorAll("article")].map((a) => [a.querySelector("strong")?.textContent, !!a.querySelector("time")?.textContent])).toEqual([["Grace Hopper", true], ["Ada Lovelace", true]]);
  // Grace wrote the first one: only that one has Delete.
  expect([...doc().querySelectorAll("article")].map((a) => !!a.querySelector("button"))).toEqual([true, false]);
});
await test("7. Posting does not send note-comment and add the comment, the counter is missing, or the owner cannot delete another's comment", COMMENTS, async () => {
  await open(1440, {
    "note-comment": (req: any) => ({ comment: comment("c3", ada, req.body.body, "2026-09-03T09:00:00Z") }),
    "note-comment-delete": { comment: { id: "c1" } },
  });
  await waitFor(() => commentTexts().length === 2);
  expect([...doc().querySelectorAll("article")].map((a) => !!a.querySelector("button"))).toEqual([true, true]);
  const box = control("Add a comment") as HTMLTextAreaElement;
  await type(box, "Thanks, see you there.");
  expect(doc().body.textContent).toContain("22 / 2,000");
  await click(button("Post comment"));
  const sent = await waitFor(() => api.sent.find((r) => r.route === "note-comment"));
  expect(sent.body).toEqual({ id: "n1", body: "Thanks, see you there." });
  await waitFor(() => commentTexts().length === 3);
  expect([commentTexts()[2], (control("Add a comment") as HTMLTextAreaElement).value]).toEqual(["Thanks, see you there.", ""]);
  await click(button("Delete comment by Grace Hopper"));
  const del = await waitFor(() => api.sent.find((r) => r.route === "note-comment-delete"));
  expect(del.body).toEqual({ id: "n1", commentId: "c1" });
  await waitFor(() => commentTexts().length === 2);
  expect(commentTexts()[0]).toBe("Yes, week 6.");
});
await test("8. A server refusal on posting or deleting a comment is not shown inline", COMMENTS, async () => {
  await open(1440, {
    "note-comment": { status: 422, body: { error: "Comments can be at most 2000 characters." } },
    "note-comment-delete": { status: 403, body: { error: "Only the comment's author or the note's owner can delete it." } },
  });
  await waitFor(() => commentTexts().length === 2);
  await type(control("Add a comment") as HTMLTextAreaElement, "A thought");
  await click(button("Post comment"));
  await waitFor(() => doc().querySelector("form [role=alert]")?.textContent === "Comments can be at most 2000 characters.");
  await click(button("Delete comment by Ada Lovelace"));
  await waitFor(() => doc().querySelector("form [role=alert]")?.textContent === "Only the comment's author or the note's owner can delete it.");
  expect(commentTexts().length).toBe(2);
});
await test("9. A viewer can edit the note, or cannot comment", EDITOR, async () => {
  await open(1440, { "note-collaborators": { collaborators: [person(grace, "view")] }, "note-comment": { comment: comment("c3", grace, "Question", "2026-09-03T09:00:00Z") } }, grace);
  await waitFor(() => button("Leave this note"));
  expect(doc().querySelector(".ProseMirror")!.getAttribute("contenteditable")).toBe("false");
  await type(control("Add a comment") as HTMLTextAreaElement, "Question");
  await click(button("Post comment"));
  await waitFor(() => commentTexts().length === 3);
});
await test("10. The word \"Prototype\" or a scenario switch is still on the screen", COMMENTS, async () => {
  await open(1440);
  await waitFor(() => commentTexts().length === 2);
  expect([doc().body.textContent!.includes("Prototype"), !!doc().querySelector("details"), control("Comment loading"), control("Comment posting")]).toEqual([false, false, null, null]);
});
await test("11. At 375 the People panel is not a bottom sheet, or the page scrolls sideways", "src/features/note-editor.module.css → .inspector", async () => {
  const root = await open(375, { "note-collaborators": { collaborators: [person(grace, "edit"), person(alan)] } });
  await waitFor(() => rows().length === 2);
  await wait(400);
  const panel = root.querySelector("#note-people")!;
  const rect = panel.getBoundingClientRect();
  expect([root.ownerDocument.defaultView!.getComputedStyle(panel).position, Math.round(rect.bottom) >= root.ownerDocument.defaultView!.innerHeight - 1, pageScrollWidth() <= 375]).toEqual(["fixed", true, true]);
});
