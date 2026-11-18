import { describe, expect, it } from "vitest";
import { cases } from "../../../../src/services/syllabus-placement.cases";
import { placeRangedEvent } from "../../../../src/services/syllabus-placement";

describe("placeRangedEvent", () => {
  for (const c of cases) it(c.label, () => expect(placeRangedEvent(c.event, c.context)).toEqual(c.want));
  it("does not change its inputs", () => {
    const c = cases[9];
    const before = JSON.stringify(c);
    placeRangedEvent(c.event, c.context);
    expect(JSON.stringify(c)).toBe(before);
  });
});
