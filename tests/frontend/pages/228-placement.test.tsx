// Processing test: calls placeRangedEvent directly with the cases in src/services/syllabus-placement.cases.ts
// (the same ones npm test runs). No screen, no API.
import { page, test, expect } from "../../shared/runner.js";
import { cases, FILE } from "../../../src/services/syllabus-placement.cases";
import { placeRangedEvent } from "../../../src/services/syllabus-placement";

page({ card: "228", title: "Processing: Place ranged items on the student's section days", kind: "frontend" });

for (const c of cases) {
  await test(c.label, FILE, () => expect(placeRangedEvent(c.event, c.context)).toEqual(c.want));
}
