import type { Course } from "../domain";

const months = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const monthPattern = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
const datePattern = new RegExp(
  `(?<![a-z0-9])(?:\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}|\\d{1,2}/\\d{1,2}/\\d{4}|${monthPattern}\\s+\\d{1,2}(?:st|nd|rd|th)?[,]?\\s+\\d{4}|\\d{1,2}(?:st|nd|rd|th)?\\s+${monthPattern}\\s+\\d{4})(?![a-z0-9])`,
  "gi",
);

function normalizeDate(value: string): string {
  let year: number, month: number, day: number;
  const numeric = value.split(/[-/]/);
  if (numeric.length === 3) {
    // Numeric dates use year-first ISO or US month/day/year. Never infer a year.
    [year, month, day] = numeric[0].length === 4
      ? numeric.map(Number)
      : [Number(numeric[2]), Number(numeric[0]), Number(numeric[1])];
  } else {
    const parts = value.toLowerCase().replace(/(\d)(st|nd|rd|th)/g, "$1")
      .replace(/[,.]/g, "").split(/\s+/);
    const monthFirst = /^[a-z]/.test(parts[0]);
    month = months.findIndex((m) => m.startsWith((monthFirst ? parts[0] : parts[1]).slice(0, 3))) + 1;
    day = Number(monthFirst ? parts[1] : parts[0]);
    year = Number(parts[2]);
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (year < 1000 || date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function unique(values: string[]): string {
  const distinct = [...new Set(values)];
  return distinct.length === 1 ? distinct[0] : "";
}

function dates(text: string): string[] {
  return (text.match(datePattern) || []).map(normalizeDate);
}

function courseMatches(text: string, courses: Course[]): string[] {
  return courses.filter((course) => {
    const parts = course.code.match(/[a-z]+|\d+/gi);
    if (!parts) return false;
    const pattern = new RegExp(`(?:^|[^a-z0-9])${parts.join("[\\s_-]*")}(?=$|[^a-z0-9])`, "i");
    return pattern.test(text);
  }).map((course) => course.id);
}

/** Conservative, local Sprint 1 extraction; unknown or conflicting values stay empty. */
export function detectNoteMetadata(text: string, filename: string, courses: Course[]) {
  const name = filename.replace(/\.[^.]+$/, "").replace(/_/g, " ");
  const lines = text.split(/\r?\n/).map((line) => line.replace(/[*#]/g, "").trim());
  const labeledCourses = lines.filter((line) => /^course(?:\s+code)?\s*[:=-]/i.test(line));
  const contentCourses = courseMatches(labeledCourses.length ? labeledCourses.join("\n") : text, courses);
  const courseId = labeledCourses.length || contentCourses.length
    ? unique(contentCourses) : unique(courseMatches(name, courses));

  // Prefer an explicit lecture date, then a Date header, then a date-only line.
  // Assignment/deadline dates in prose are deliberately not lecture dates.
  const lectureLines = lines.filter((line) => /^lecture(?:\s+date)?\s*[:=-]/i.test(line));
  const dateLines = lines.filter((line) => /^date\s*[:=-]/i.test(line));
  const standalone = lines.filter((line) => {
    const matches = line.match(datePattern);
    return matches?.length === 1 && matches[0] === line;
  });
  const candidates = lectureLines.length ? lectureLines : dateLines.length ? dateLines : standalone;
  const lectureDate = unique(dates(candidates.length ? candidates.join("\n") : name));
  return { courseId, lectureDate };
}
