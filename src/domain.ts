export const BRAND = "Notely";
export type CollaboratorPermission = "view" | "edit";
export type Visibility = "private" | "shared";
export const CLASS_KINDS = ["lecture", "recitation", "lab"] as const;
export type ClassKind = (typeof CLASS_KINDS)[number];
export type EventKind = ClassKind | "assignment" | "quiz" | "exam" | "deadline" | "other";
export interface User {
  id: string;
  name: string;
  email: string;
}
export interface OnboardingState {
  completed: boolean;
  step: number;
}
// Weekly classes are on the schedule, but they aren't something due (card 48).
export const isClass = (kind: EventKind) => kind === "lecture" || kind === "recitation" || kind === "lab";
export interface Course {
  id: string;
  code: string;
  name: string;
  color: string;
  term: string;
  // First and last day of classes, when the student gave them (card 46). A syllabus's own dates come first.
  classesStart?: string;
  classesEnd?: string;
}
export interface Category {
  id: string;
  name: string;
}
export interface ChecklistItem {
  text: string;
  done: boolean;
}
export type HighlightColor = "yellow" | "green" | "pink";

export interface NoteHighlight {
  start: number;
  end: number;
  color: HighlightColor;
}
export interface Note {
  checklist?: ChecklistItem[];
  highlights?: NoteHighlight[];
  id: string;
  ownerId?: string;
  // Recorded at creation time so comment permission checks (task #65) can
  // tell the creator apart from anyone else, since every mock user shares
  // the literal id "student" - ownerId alone can't distinguish people.
  ownerEmail?: string;
  title: string;
  body: string;
  courseId: string;
  lectureDate: string;
  category: string;
  visibility: Visibility;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
}
export interface NoteVersion {
  id: string;
  noteId: string;
  title: string;
  body: string;
  author: string;
  createdAt: string;
}
export interface Comment {
  id: string;
  noteId: string;
  body: string;
  author: string;
  authorId: string;
  createdAt: string;
}
// Prototype-only: lets the UI demo loading/posting success/failure without a
// real network layer to intercept, same purpose as ImportRepository's scenario.
export type CommentScenario = "success" | "slow" | "failure";
export const MAX_COMMENT_LENGTH = 2000;
export interface CourseEvent {
  id: string;
  courseId: string;
  title: string;
  kind: EventKind;
  date: string;
  time: string;
  location: string;
  description: string;
  source: "manual" | "imported";
  // Ties together the saved meetings of one weekly class from a syllabus (card 47).
  seriesId?: string | null;
}
export interface DetectedMetadata {
  title: string;
  courseId: string;
  lectureDate: string;
  category: string;
}
export type UploadKind = "document" | "scan" | "syllabus";
// An event proposed from a syllabus. needsReview means it has no clear date yet (card 44);
// include: false means the student left it out on the review screen (card 46).
export interface DetectedEvent extends CourseEvent {
  needsReview?: boolean;
  include?: boolean;
}
// A weekly class found in a syllabus (card 44). days are numbers, with 0 for Sunday. It becomes one saved
// event per meeting between starts and ends, skipping the job's noClassDates.
export interface DetectedMeeting {
  title: string;
  kind: ClassKind;
  section: string;
  days: number[];
  time: string;
  location: string;
  starts: string;
  ends: string;
  source: string;
  include: boolean;
}
export interface UploadJob {
  id: string;
  kind: UploadKind;
  name: string;
  state:
    "queued" | "processing" | "review" | "completed" | "partial" | "failed";
  metadata: DetectedMetadata;
  events: DetectedEvent[];
  meetings?: DetectedMeeting[];
  noClassDates?: { from: string; to: string }[];
  // False when the reader says the file isn't a course syllabus at all (card 127).
  isSyllabus?: boolean;
  // Shown on the review screen, such as when a demo shows sample results (card 45).
  notice?: string;
}
export interface NoteQuery {
  q?: string;
  course?: string;
  category?: string;
  visibility?: string;
  from?: string;
  to?: string;
  sort?: string;
}
export interface AuthRepository {
  session(): Promise<User | null>;
  signIn(email: string, password: string): Promise<User>;
  signUp(name: string, email: string, password: string): Promise<{ user: User; recoveryCode: string }>;
  signOut(): Promise<void>;
  startDemo(): Promise<void>;
  updateProfile(name: string, email: string, currentPassword: string): Promise<User>;
  changePassword(currentPassword: string, password: string): Promise<void>;
  resetPassword(email: string, recoveryCode: string, password: string): Promise<string>;
  replaceRecoveryCode(currentPassword: string): Promise<string>;
  deleteAccount(currentPassword: string): Promise<void>;
  onboarding(): Promise<OnboardingState>;
  completeOnboarding(): Promise<void>;
}
export interface CourseRepository {
  list(): Promise<Course[]>;
  create(course: Omit<Course, "id">): Promise<Course>;
  folders(id: string): Promise<Record<string, Note[]>>;
}
export interface NoteRepository {
  setCollaboratorPermission(id: string,collaboratorId: string,permission: CollaboratorPermission,): Promise<Collaborator>;
  collaborators(id: string): Promise<Collaborator[]>;
  inviteCollaborator(id: string, email: string): Promise<{ collaborator: Collaborator }>;
  list(query?: NoteQuery): Promise<Note[]>;
  get(id: string): Promise<Note>;
  save(note: Note): Promise<Note>;
  setPinned(id: string, pinned: boolean): Promise<Note>;
  create(data: Partial<Note>): Promise<Note>;
  // Removes the note with its comments, versions, and collaborator entries.
  delete(id: string): Promise<void>;
  comments(id: string, scenario?: CommentScenario): Promise<Comment[]>;
  comment(id: string, body: string, scenario?: CommentScenario): Promise<Comment>;
  versions(id: string): Promise<NoteVersion[]>;
  restore(id: string, versionId: string): Promise<Note>;
}
export interface Collaborator {
  id: string;
  name: string;
  email: string;
  status?: "Pending" | "Invited" | "Accepted";
  permission: CollaboratorPermission;
}
export interface ScheduleRepository {
  list(from?: string, to?: string): Promise<CourseEvent[]>;
  save(event: CourseEvent): Promise<CourseEvent>;
  // Card 173: removes the event from the schedule (a syllabus event also from the server).
  // With wholeSeries, every meeting of the event's weekly class goes too (card 48).
  remove(event: CourseEvent, wholeSeries?: boolean): Promise<void>;
  lectureNotes(event: CourseEvent): Promise<Note[]>;
}
export interface ImportRepository {
  validate(file: Pick<File, "name" | "size">, kind: UploadKind): string | null;
  // Registers the file as a queued job; a signed-in student's syllabus goes to the server (card 43).
  start(file: File, kind: UploadKind, scenario?: string, courseId?: string): Promise<UploadJob>;
  // Reads a queued job's file and proposes note details or schedule events (cards 44 and 45).
  process(job: UploadJob, scenario?: string): Promise<UploadJob>;
  // first is the earliest date added, for opening the schedule on it (card 48).
  confirm(job: UploadJob): Promise<{ created: number; skipped: number; first: string }>;
}
export interface Repositories {
  auth: AuthRepository;
  courses: CourseRepository;
  notes: NoteRepository;
  schedule: ScheduleRepository;
  imports: ImportRepository;
  reset(): Promise<void>;
}
