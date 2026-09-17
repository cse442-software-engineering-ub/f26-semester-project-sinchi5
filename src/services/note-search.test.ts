import { describe, expect, it } from "vitest";
import type { Note } from "../domain";
import { seedNotes } from "./fixtures";
import { createRepositories, filterNotes } from "./repositories";

describe("note keyword search", () => {
  const base = seedNotes()[0];
  const notes: Note[] = [
    {
      ...base,
      id: "title-match",
      title: "Photosynthesis overview",
      body: "Plants use sunlight.",
    },
    {
      ...base,
      id: "body-match",
      title: "Biology lecture",
      body: "Chlorophyll is involved in photosynthesis.",
    },
    {
      ...base,
      id: "both-match",
      title: "Photosynthesis review",
      body: "Review the stages of photosynthesis.",
    },
    {
      ...base,
      id: "unrelated",
      title: "Weekly plans",
      body: "Prepare for Friday.",
      tags: ["photosynthesis"],
    },
  ];
  const ids = (q: string) => filterNotes(notes, { q }).map((n) => n.id);

  it("matches a keyword found only in the title", () => {
    expect(ids("overview")).toEqual(["title-match"]);
  });

  it("matches a keyword found only in the content", () => {
    expect(ids("chlorophyll")).toEqual(["body-match"]);
  });

  it("returns every matching note once and excludes unrelated notes", () => {
    expect(ids("photosynthesis")).toEqual([
      "title-match",
      "body-match",
      "both-match",
    ]);
  });

  it.each(["PHOTOSYNTHESIS", "pHoToSyNtHeSiS"])(
    "searches titles and content without case sensitivity: %s",
    (q) => {
      expect(ids(q)).toEqual(["title-match", "body-match", "both-match"]);
    },
  );

  it("returns no results for an unmatched keyword", () => {
    expect(ids("astronomy")).toEqual([]);
  });

  it.each(["School", "scrum", "Software Engineering", "CSE 442"])(
    "does not match metadata alone: %s",
    (q) => {
      expect(ids(q)).toEqual([]);
    },
  );

  it("does not match a phrase spanning the title and content", () => {
    expect(ids("overview Plants")).toEqual([]);
  });

  it("restores all saved notes when the keyword is cleared without changing them", async () => {
    const repo = createRepositories();
    const saved = await repo.notes.create({
      title: "Photosynthesis overview",
      body: "Plants use sunlight.",
    });
    const allNotes = await repo.notes.list();

    expect(await repo.notes.list({ q: "photosynthesis" })).toEqual([saved]);
    expect(await repo.notes.list({ q: "no-such-keyword" })).toEqual([]);
    expect(await repo.notes.list({ q: "" })).toEqual(allNotes);
    expect(await repo.notes.list()).toEqual(allNotes);
  });
});
