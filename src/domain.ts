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
  hasPhoto: boolean;
}
export interface OnboardingState {
  completed: boolean;
  step: number;
}
// Weekly classes are on the schedule, but they aren't something due (card 48).
export const isClass = (kind: EventKind) => (CLASS_KINDS as readonly EventKind[]).includes(kind);
export interface Course {
  id: string;
  code: string;
  name: string;
  color: string;
  term: string;
  // First and last day of classes, when the student gave them (card 46). A syllabus's own dates come first.
  classesStart?: string;
  classesEnd?: string;
  // Card 144: a course a classmate shared with this student (card 143). Its schedule is view only.
  sharedBy?: SharedBy;
  permission?: CollaboratorPermission;
}
// Card 144: who shared a course's schedule.
export interface SharedBy {
  id: string;
  name: string;
}
export interface Category {
  id: string;
  name: string;
}
export interface Note {
  id: string;
  ownerId?: string;
  title: string;
  // Cleaned HTML from the server (card 240); the browser demo may still hold plain text (format "text").
  body: string;
  format?: "text" | "html";
  // Plain text start of the body, at most 300 characters (card 240).
  excerpt?: string;
  courseId: string;
  lectureDate: string;
  category: string;
  visibility: Visibility;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  // Card 158: set on a note a friend shared through a course (card 156); it is read only.
  sharedBy?: { id: string; name: string; courseCode: string };
  permission?: "view";
  remindAt?: string | null;
  // Card 243: the event occurrence this note is attached to, if any.
  eventId?: string | null;
  eventDate?: string | null;
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
export const MAX_COMMENT_LENGTH = 2000;
export interface RepeatRule {
  every: 1 | 2;
  days: number[];
  until: string;
}
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
  repeat?: RepeatRule;
  repeatOf?: string;
  // Card 144: an event in a course a classmate shared (card 143); it is view only.
  sharedBy?: SharedBy;
  permission?: CollaboratorPermission;
  addedBy?: SharedBy;
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
  // Set by the reader when the file gives a span or a week and no day (date is then ""); absent otherwise.
  rangeStart?: string;
  rangeEnd?: string;
  week?: number;
  meeting?: ClassKind;
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
  // The text of an uploaded TXT/Markdown note, saved as the note's body (card 35).
  body?: string;
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
  tag?: string;
  course?: string;
  category?: string;
  visibility?: string;
  from?: string;
  to?: string;
  sort?: string;
  // Card 245: only the notes attached to this event (on this date, when given).
  event?: string;
  eventDate?: string;
}
export type ThemeMode = "system" | "light" | "dark";
export type ColorScheme = "sage" | "fjord" | "rose" | "mocha";
export interface CustomTheme { id: string; name: string; accent: string; background: string; text: string }
export type ThemeInput = Omit<CustomTheme, "id"> & { id?: string };
// scheme is a built-in name or "custom:<id>"; customThemes comes from the session and the theme routes.
export interface Preferences { mode: ThemeMode; scheme: ColorScheme | `custom:${string}`; customThemes?: CustomTheme[] }
export interface AuthRepository {
  preferences(): Preferences;
  savePreferences(next: Preferences): Promise<Preferences>;
  saveTheme(theme: ThemeInput): Promise<Preferences>;
  deleteTheme(id: string): Promise<Preferences>;
  session(): Promise<User | null>;
  signIn(email: string, password: string): Promise<User>;
  signUp(name: string, email: string, password: string): Promise<{ user: User; recoveryCode: string }>;
  signOut(): Promise<void>;
  updateProfile(name: string, email: string, currentPassword: string): Promise<User>;
  uploadProfilePhoto(content: string): Promise<User>;
  removeProfilePhoto(): Promise<User>;
  changePassword(currentPassword: string, password: string): Promise<void>;
  resetPassword(email: string, recoveryCode: string, password: string): Promise<string>;
  replaceRecoveryCode(currentPassword: string): Promise<string>;
  deleteAccount(currentPassword: string): Promise<void>;
  onboarding(): Promise<OnboardingState>;
  completeOnboarding(): Promise<void>;
}
export interface CourseRepository {
  list(): Promise<Course[]>;
  remove(id: string): Promise<void>;
  create(course: Omit<Course, "id">): Promise<Course>;
  folders(id: string): Promise<Record<string, Note[]>>;
}
export interface NoteRepository {
  setCollaboratorPermission(id: string,collaboratorId: string,permission: CollaboratorPermission,): Promise<Collaborator>;
  collaborators(id: string): Promise<Collaborator[]>;
  inviteCollaborator(id: string, email: string): Promise<{ collaborator: Collaborator }>;
  // Card 247: the owner removes anyone; a collaborator leaves by removing their own id.
  removeCollaborator(id: string, collaboratorId: string): Promise<void>;
  list(query?: NoteQuery): Promise<Note[]>;
  get(id: string): Promise<Note>;
  save(note: Note): Promise<Note>;
  setPinned(id: string, pinned: boolean): Promise<Note>;
  setReminder(id: string, remindAt: string | null): Promise<Note>;
  // Card 245: attaches the note to one occurrence of an event, or with eventId null detaches it.
  link(id: string, eventId: string | null, date: string): Promise<Note>;
  create(data: Partial<Note>): Promise<Note>;
  // Removes the note with its comments, versions, and collaborator entries.
  delete(id: string): Promise<void>;
  comments(id: string): Promise<Comment[]>;
  comment(id: string, body: string): Promise<Comment>;
  deleteComment(id: string, commentId: string): Promise<void>;
  versions(id: string): Promise<NoteVersion[]>;
  restore(id: string, versionId: string): Promise<Note>;
}
export interface Collaborator {
  id: string;
  name: string;
  email: string;
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
// Card 154: a classmate in the friends list or a pending request. `id` is the friendship's id.
export interface Friend {
  id: string;
  userId: string;
  name: string;
  email: string;
}
// Card 157: a friend one course's notes are shared with (card 156).
export interface CourseShare {
  userId: string;
  name: string;
  email: string;
}
// Card 144: a classmate one course's schedule is shared with (card 143), view only.
export interface ScheduleShare {
  userId: string;
  name: string;
  email: string;
  permission: CollaboratorPermission;
}
// Card 144: courses the student can add events to; a classmate's shared course is view only.
export const ownCourses = (courses: Course[]) => courses.filter((c) => !c.sharedBy);
export const editableCourses = (courses: Course[]) => courses.filter((c) => !c.sharedBy || c.permission === "edit");
export interface FriendLists {
  friends: Friend[];
  incoming: Friend[];
  outgoing: Friend[];
}
