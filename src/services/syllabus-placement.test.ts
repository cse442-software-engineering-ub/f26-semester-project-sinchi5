import { describe, expect, it } from "vitest";
import { describeRange, placeRangedEvent } from "./syllabus-placement";
// The same cases the card's test page runs, so the page and this file can't drift apart.
import { CASES } from "../../tests/frontend/pages/234-placement.cases";

describe("placing a ranged syllabus item on the student's section days (card 234)", () => {
  it.each(CASES.map((c, i) => [`${i + 1}. ${c.label}`, c] as const))("%s", (_, c) => {
    expect(placeRangedEvent(c.event, c.context)).toEqual(c.expect);
  });

  it("covers every rule with at least 20 cases, each with a pointer", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(CASES.map((c) => c.label)).size).toBe(CASES.length);
    expect(CASES.every((c) => c.lookAt.startsWith("src/services/syllabus-placement.ts"))).toBe(true);
  });

  it("changes neither the item nor the context it was given", () => {
    for (const c of CASES) {
      const before = JSON.stringify([c.event, c.context]);
      placeRangedEvent(c.event, c.context);
      expect(JSON.stringify([c.event, c.context])).toBe(before);
    }
  });

  it("names a range the way the review screen shows it", () => {
    expect(describeRange("2026-10-05", "2026-10-09")).toBe("October 5–9");
    expect(describeRange("2026-09-28", "2026-10-02")).toBe("September 28 – October 2");
    expect(describeRange("2026-12-28", "2027-01-01")).toBe("December 28, 2026 – January 1, 2027");
    expect(describeRange("2026-10-07", "2026-10-07")).toBe("October 7");
  });
});
