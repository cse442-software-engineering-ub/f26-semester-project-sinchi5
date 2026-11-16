// Frontend test: the real placement code (src/services/syllabus-placement.ts) called directly. It is a pure
// function, so there is no screen to mount and no API request to script; a request would mean it is not pure.
import "../../../src/app/tokens.css";
import { page, test, expect } from "../../shared/runner.js";
import { placeRangedEvent } from "../../../src/services/syllabus-placement";
import { normalizeEvents } from "../../../src/services/syllabus";
import { CASES } from "./234-placement.cases";

page({ card: "234", title: "Processing: Place ranged items on the student's section days", kind: "frontend" });

// Counts requests made from here on (the runner asked for build.json already, inside page()).
const realFetch = window.fetch;
let requests = 0;
window.fetch = ((...args: Parameters<typeof fetch>) => { requests++; return realFetch(...args); }) as typeof fetch;

CASES.forEach((c, i) => test(`${i + 1}. ${c.label}`, c.lookAt, () => {
  expect(placeRangedEvent(c.event, c.context)).toEqual(c.expect);
}));
let n = CASES.length;
await test(`${++n}. Placing an item changes the item or the student's sections it was given`, "src/services/syllabus-placement.ts → placeRangedEvent (it must build new values)", () => {
  for (const c of CASES) {
    const before = JSON.stringify([c.event, c.context]);
    placeRangedEvent(c.event, c.context);
    expect(JSON.stringify([c.event, c.context])).toBe(before);
  }
});
await test(`${++n}. What the reader returns (card 233) can't be placed until someone reshapes it`, "src/services/syllabus.ts → normalizeEvents (the span, week and class kind)", () => {
  const [lab3, homework] = normalizeEvents([
    { title: "Lab 3", kind: "assignment", date: "", time: "", location: "", source: "Week 5: Lab 3 due", week: 5, meeting: "lab" },
    { title: "Homework 1", kind: "assignment", date: "2026-09-28", time: "", location: "", source: "Homework 1 due September 28", meeting: "lecture" },
  ]);
  const context = CASES[2].context;
  expect(placeRangedEvent(lab3, context)).toEqual({ date: "2026-09-22", time: "14:00", derived: true, reason: "Date worked out from week 5 (September 21–27)" });
  expect(placeRangedEvent(homework, context)).toEqual({ date: "2026-09-28", time: "", derived: false, reason: "" });
});
await test(`${++n}. Placing items sends a request to the server`, "src/services/syllabus-placement.ts (it must not call fetch or a repository)", () => {
  expect(requests).toBe(0);
});
