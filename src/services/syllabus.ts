// Card 44: turns syllabus text into proposed schedule events. Nothing here touches the schedule,
// and it runs in the browser with plain rules, so reading a TXT or Markdown syllabus costs nothing.
export type SyllabusEventKind = "assignment" | "exam" | "quiz" | "deadline" | "other";
export const SYLLABUS_EVENT_KINDS: readonly SyllabusEventKind[] = ["assignment", "exam", "quiz", "deadline", "other"];
export const MAX_SYLLABUS_EVENTS = 200;

export interface ProposedEvent {
  title: string;
  kind: SyllabusEventKind;
  // YYYY-MM-DD, or "" when the syllabus doesn't give one clear date.
  date: string;
  // 24-hour HH:MM, only when the line names a time.
  time?: string;
  // The syllabus line the event came from, so the student can check it.
  source: string;
  // Set when the date is relative, missing, invalid, or one of several; the student must pick it.
  needsReview?: true;
}

const MONTH = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const WEEKDAY_NAME = String.raw`(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?`;
const WEEKDAY = String.raw`(?:${WEEKDAY_NAME}\.?,?\s+)?`;
const YEAR = String.raw`(?:,?\s+(\d{4})\b)?`;
const monthNumber = (name: string) =>
  ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(name.slice(0, 3).toLowerCase()) + 1;

// Checked in this order; a later rule never claims text an earlier rule matched,
// so "Homework 1 September 28" reads as September 28, not 1 September.
const DATE_RULES: { pattern: RegExp; parts: (m: RegExpExecArray) => [string | undefined, number, number] }[] = [
  { pattern: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, parts: (m) => [m[1], +m[2], +m[3]] },
  { pattern: new RegExp(String.raw`\b${WEEKDAY}${MONTH}\s+(\d{1,2})(?:st|nd|rd|th)?\b${YEAR}`, "gi"), parts: (m) => [m[3], monthNumber(m[1]), +m[2]] },
  { pattern: new RegExp(String.raw`\b${WEEKDAY}(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?${MONTH}${YEAR}`, "gi"), parts: (m) => [m[3], monthNumber(m[2]), +m[1]] },
  { pattern: new RegExp(String.raw`\b${WEEKDAY}(\d{1,2})/(\d{1,2})(?:/(\d{4}|\d{2}))?\b`, "gi"), parts: (m) => [m[3], +m[1], +m[2]] },
];
const TIME_RULES: { pattern: RegExp; time: (m: RegExpExecArray) => string }[] = [
  {
    pattern: /(?:\b(?:at|by)\s+|@\s*)?\b(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?\s?m\b\.?/gi,
    time: (m) => +m[1] >= 1 && +m[1] <= 12 ? clock((+m[1] % 12) + (m[3].toLowerCase() === "p" ? 12 : 0), +(m[2] ?? 0)) : "",
  },
  { pattern: /(?:\b(?:at|by)\s+|@\s*)?\b([01]?\d|2[0-3]):([0-5]\d)\b/g, time: (m) => clock(+m[1], +m[2]) },
  // "Due at midnight" means the end of that day.
  { pattern: /(?:\b(?:at|by)\s+)?\b(noon|midnight)\b/gi, time: (m) => (m[1].toLowerCase() === "noon" ? "12:00" : "23:59") },
];
// Dates the rules must not guess: relative days, placeholders, and course weeks.
const RELATIVE = new RegExp(
  String.raw`\b(?:(?:next|this|following)\s+(?:week|${WEEKDAY_NAME})|tomorrow|tba|tbd|to be (?:announced|determined)|week\s*\d+)\b`, "gi");
const EVENT_WORDS = /\b(?:exams?|midterms?|quiz(?:zes)?|homework|hw|assignments?|problem sets?|psets?|labs?|projects?|papers?|essays?|reports?|drafts?|proposals?|presentations?|due|deadlines?|submissions?)\b/i;
const KINDS: [SyllabusEventKind, RegExp][] = [
  ["exam", /\b(?:exam|examination|midterm|test\s*#?\d)s?\b/i],
  ["quiz", /\bquiz/i],
  ["assignment", /\b(?:homework|hw\s*#?\d|assignment|problem set|pset|lab|worksheet|exercise)s?\b/i],
  ["deadline", /\b(?:project|paper|essay|report|draft|proposal|presentation|due|deadline|submission)s?\b/i],
];
const EDGE = String.raw`[\s\-–—:;,.|@•▪◦·]`;
const LEADING = new RegExp(String.raw`^(?:${EDGE}|\d+[.)](?=\s)|(?:due|deadline|on)(?![\p{L}\p{N}]))+`, "iu");
const TRAILING = new RegExp(String.raw`(?:${EDGE}|(?<![\p{L}\p{N}])(?:due|on|at|by|is|are|before|deadline))+$`, "iu");

function clock(hours: number, minutes: number) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// Returns YYYY-MM-DD, or "" for a day that doesn't exist (February 30) or an implausible year.
function isoDate(year: number, month: number, day: number) {
  if (year < 2000 || year > 2100) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : "";
}

function plainText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  // Control and invisible characters never belong in a title; other text is kept exactly.
  return Array.from(value.replace(/\p{C}+/gu, " ").replace(/\s+/g, " ").trim()).slice(0, max).join("");
}

function cleanTitle(text: string) {
  // A schedule table's week number sits in its own column, set off by a wide gap or a table bar.
  let title = text.replace(/^\s*(?:week\s*)?\d{1,2}(?=\s{2,})/i, "");
  title = title.replace(/\(\s*\)|\[\s*\]/g, " ").replace(/\s+/g, " ");
  title = title.replace(LEADING, "").replace(TRAILING, "");
  return plainText(title, 255);
}

function parseLine(line: string, year: number): ProposedEvent | null {
  const source = plainText(line, 500);
  // Table bars and Markdown markers separate words the way spaces do.
  const text = source.replace(/[|*#>`_]+/g, " ");
  const keyword = EVENT_WORDS.test(text);
  const claimed: [number, number][] = [];
  const take = (pattern: RegExp, accept: (m: RegExpExecArray) => boolean = () => true) => {
    const found: RegExpExecArray[] = [];
    for (const m of text.matchAll(pattern)) {
      const end = m.index + m[0].length;
      if (claimed.some(([a, b]) => m.index < b && end > a) || !accept(m)) continue;
      claimed.push([m.index, end]);
      found.push(m);
    }
    return found;
  };
  // A bare 3/4 is too easily a fraction or chapter list, so it needs a year or an event word.
  const dates = DATE_RULES.flatMap((rule, i) =>
    take(rule.pattern, (m) => i < 3 || Boolean(m[3]) || keyword).map(rule.parts));
  const times = TIME_RULES.flatMap((rule) => take(rule.pattern).map(rule.time)).filter(Boolean);
  const relative = take(RELATIVE).length > 0;
  if (!dates.length && !(relative && keyword)) return null;

  let date = "";
  if (dates.length === 1) {
    const [y, month, day] = dates[0];
    const fullYear = y === undefined ? year : y.length === 2 ? 2000 + +y : +y;
    date = isoDate(fullYear, month, day);
  }
  let rest = "";
  let at = 0;
  for (const [a, b] of claimed.sort((x, y) => x[0] - y[0])) {
    rest += text.slice(at, a) + " ";
    at = b;
  }
  const title = cleanTitle(rest + text.slice(at));
  if (!title) return null;
  return {
    title,
    kind: KINDS.find(([, pattern]) => pattern.test(text))?.[0] ?? "other",
    date,
    ...(times[0] ? { time: times[0] } : {}),
    source,
    ...(date ? {} : { needsReview: true as const }),
  };
}

// Proposes one event per syllabus line that has a date (or a relative date next to an event word).
// Dates without a year use `year`, normally the course term's year.
export function extractEvents(text: string, year: number): ProposedEvent[] {
  return normalizeEvents(text.split(/\r\n|\r|\n/).map((line) => parseLine(line, year)).filter(Boolean));
}

// Cleans events proposed by any reader (these rules or the server) into the same safe shape:
// known kinds, real dates or a review flag, no duplicates, and at most MAX_SYLLABUS_EVENTS.
export function normalizeEvents(items: unknown): ProposedEvent[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const events: ProposedEvent[] = [];
  for (const item of items) {
    if (events.length >= MAX_SYLLABUS_EVENTS) break;
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const title = plainText(raw.title, 255);
    if (!title) continue;
    const parts = typeof raw.date === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.date) : null;
    const date = parts && isoDate(+parts[1], +parts[2], +parts[3]) === raw.date ? raw.date : "";
    const time = typeof raw.time === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw.time) ? raw.time : "";
    const key = `${title.toLowerCase()}|${date}|${time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({
      title,
      kind: SYLLABUS_EVENT_KINDS.includes(raw.kind as SyllabusEventKind) ? (raw.kind as SyllabusEventKind) : "other",
      date,
      ...(time ? { time } : {}),
      source: plainText(raw.source, 500),
      ...(date && raw.needsReview !== true ? {} : { needsReview: true as const }),
    });
  }
  return events;
}

// Short lines that name a graded item, like a table cell or heading ("Midterm exam", "Project 2 due").
const GRADED_ITEM = /\b(?:exams?|midterms?|finals?|quiz(?:zes)?|homework|hw\s*#?\d|assignments?|projects?|papers?|due|deadlines?)\b/i;

// Why the rules' events can't be trusted on their own, or null when they're good enough to show as
// they are. The browser asks the AI reader only for a reason, so most syllabi cost nothing.
// ponytail: fixed thresholds; tune them against real syllabi from the team's courses.
export type RulesVerdict = "no-text" | "no-events" | "unsure" | "missed" | null;
export function rulesVerdict(text: string, events: ProposedEvent[]): RulesVerdict {
  // A scan or photo has little or no text to read.
  if (!events.length) return (text.match(/\p{L}/gu)?.length ?? 0) < 100 ? "no-text" : "no-events";
  // "Next Friday" or "TBA" stumps any reader, so only lines with clashing or impossible dates count.
  const relative = new RegExp(RELATIVE.source, "i");
  if (events.filter((e) => e.needsReview && !relative.test(e.source)).length > events.length / 4) return "unsure";
  // Many graded items without a date of their own suggest a table whose dates the rules couldn't pair up.
  const missed = text.split(/\r\n|\r|\n/)
    .filter((line) => line.trim().length <= 60 && GRADED_ITEM.test(line) && !parseLine(line, 2000)).length;
  return missed >= 3 && missed > events.length / 2 ? "missed" : null;
}

// Flags each proposed date that appears nowhere in the file's text, so the student checks any date a
// reader misread or made up. A photo has no text to compare, so its dates are left as they are.
export function checkDates(events: ProposedEvent[], text: string): ProposedEvent[] {
  if (!text.trim()) return events;
  const days = new Set<string>();
  for (const rule of DATE_RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      const [, month, day] = rule.parts(m);
      days.add(`${month}-${day}`);
    }
  }
  return events.map((e) =>
    !e.date || days.has(`${+e.date.slice(5, 7)}-${+e.date.slice(8)}`) ? e : { ...e, needsReview: true as const });
}

// The AI reader's events, plus each dated exam, quiz, assignment, or deadline the rules found on a day
// the AI left empty, so neither reader's miss is lost.
export function mergeEvents(ai: ProposedEvent[], rules: ProposedEvent[]): ProposedEvent[] {
  return normalizeEvents([...ai, ...rules.filter((r) => r.date && r.kind !== "other" && !ai.some((a) => a.date === r.date))]);
}
