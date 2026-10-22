import { expect, it } from "vitest";
import { checklistDraft, checklistPayload } from "./checklists";

it("keeps duplicate rows independent and strips local identities in order", () => {
  const draft = checklistDraft([{ text: "Same", done: true }, { text: "Same", done: false }]);
  expect(draft[0].key).not.toBe(draft[1].key);
  expect(checklistPayload(draft.slice(1))).toEqual([{ text: "Same", done: false }]);
});
it("drops empty and whitespace-only drafts without trimming meaningful text", () => {
  expect(checklistPayload(checklistDraft([
    { text: "", done: false }, { text: " \t\n", done: true },
    { text: " Keep spacing ", done: true },
  ]))).toEqual([{ text: " Keep spacing ", done: true }]);
});
