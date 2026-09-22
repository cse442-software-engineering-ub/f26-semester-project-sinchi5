import type { Course, Note, CourseEvent } from "../domain";
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function offsetDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return dateKey(d);
}
export const courses: Course[] = [
  {
    id: "cse442",
    code: "CSE 442",
    name: "Software Engineering",
    color: "#869D7A",
    term: "Fall 2026",
  },
  {
    id: "cse331",
    code: "CSE 331",
    name: "Algorithms & Complexity",
    color: "#91785D",
    term: "Fall 2026",
  },
  {
    id: "psy101",
    code: "PSY 101",
    name: "Intro to Psychology",
    color: "#6e91a1",
    term: "Fall 2026",
  },
  {
    id: "mth241",
    code: "MTH 241",
    name: "Calculus III",
    color: "#a58baf",
    term: "Fall 2026",
  },
];
const topics = [
  [
    "Agile development & the Scrum framework",
    "cse442",
    "A good team builds a shared understanding before it builds software.\n\nThe three pillars of Scrum\nTransparency, inspection, and adaptation make incremental development possible. Keep the backlog visible and focus each sprint on a small, valuable outcome.\n\nKey takeaways\n• A sprint is a time-boxed cycle of planning, building, and reviewing.\n• The product owner prioritizes the backlog.\n• Daily stand-ups surface blockers, not status reports.\n\nNext steps\nWrite acceptance criteria for our first user stories.",
  ],
  [
    "Divide, conquer, and a little recursion",
    "cse331",
    "Divide the problem into smaller instances, solve each instance, and combine their solutions.\n\nMerge sort\nSplit the input into two halves. Recursively sort both halves, then merge them in linear time.\n\nThe recurrence T(n) = 2T(n/2) + O(n) gives O(n log n).",
  ],
  [
    "How we learn: memory & cognition",
    "psy101",
    "Memory involves encoding, storage, and retrieval.\n\nActive recall\nTesting yourself is more effective than rereading. Spaced practice strengthens long-term retention.",
  ],
  [
    "Vectors & three-dimensional space",
    "mth241",
    "A vector has magnitude and direction.\n\nThe dot product measures alignment. The cross product produces a perpendicular vector.\n\nPractice: sketch two vectors and their sum before calculating.",
  ],
  [
    "Team sync · ideas worth keeping",
    "cse442",
    "Meeting agenda\n• Agree on the first sprint scope\n• Review student interviews\n• Assign design and development tasks",
  ],
  [
    "A little space to think",
    "",
    "Things I want to make room for this week\n\nA walk without headphones. A library afternoon. A conversation with an old friend.",
  ],
];
export function seedNotes(): Note[] {
  return topics.map(([title, courseId, body], i) => ({
    id: `note-${i + 1}`,
    title,
    courseId,
    body,
    lectureDate: offsetDate(-i),
    category: i === 4 ? "Meetings" : i === 5 ? "Personal" : "School",
    visibility: i === 0 || i === 2 ? "shared" : "private",
    tags: i === 0 ? ["scrum", "teamwork"] : ["lecture"],
    createdAt: `${offsetDate(-i - 3)}T12:00:00`,
    updatedAt: `${offsetDate(-i)}T14:30:00`,
    pinned: i < 2,
  }));
}
export function seedEvents(): CourseEvent[] {
  return [
    {
      title: "Software Engineering",
      courseId: "cse442",
      kind: "lecture",
      date: offsetDate(0),
      time: "10:00",
      location: "Davis Hall · 101",
    },
    {
      title: "Algorithms & Complexity",
      courseId: "cse331",
      kind: "lecture",
      date: offsetDate(0),
      time: "13:00",
      location: "Norton Hall · 112",
    },
    {
      title: "Sprint 1 · user stories",
      courseId: "cse442",
      kind: "assignment",
      date: offsetDate(1),
      time: "23:59",
      location: "",
    },
    {
      title: "Memory & cognition quiz",
      courseId: "psy101",
      kind: "quiz",
      date: offsetDate(2),
      time: "11:00",
      location: "Capen Hall",
    },
    {
      title: "Problem set 3",
      courseId: "mth241",
      kind: "deadline",
      date: offsetDate(4),
      time: "23:59",
      location: "",
    },
    {
      title: "Algorithms midterm",
      courseId: "cse331",
      kind: "exam",
      date: offsetDate(7),
      time: "13:00",
      location: "Norton Hall",
    },
    {
      title: "Software Engineering",
      courseId: "cse442",
      kind: "lecture",
      date: offsetDate(3),
      time: "10:00",
      location: "Davis Hall · 101",
    },
  ].map((e, i) => ({
    ...e,
    kind: e.kind as CourseEvent["kind"],
    id: `event-${i}`,
    description: "Bring your notes and a curious mind.",
    source: i > 1 ? "imported" : "manual",
  }));
}
