export const BRAND = "Notely";
export type Visibility = "private" | "shared";
export type EventKind =
  "lecture" | "assignment" | "quiz" | "exam" | "deadline" | "other";
export interface User {
  id: string;
  name: string;
  email: string;
}
export interface OnboardingState {
  completed: boolean;
  step: number;
}
export interface Course {
  id: string;
  code: string;
  name: string;
  color: string;
  term: string;
}
export interface Category {
  id: string;
  name: string;
}
export interface Note {
  id: string;
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
  createdAt: string;
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
}
export interface DetectedMetadata {
  title: string;
  courseId: string;
  lectureDate: string;
  category: string;
}
export type UploadKind = "document" | "scan" | "syllabus";
export interface UploadJob {
  id: string;
  kind: UploadKind;
  name: string;
  state:
    "queued" | "processing" | "review" | "completed" | "partial" | "failed";
  metadata: DetectedMetadata;
  events: CourseEvent[];
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
  signIn(email: string, name?: string): Promise<User>;
  signOut(): Promise<void>;
  onboarding(): Promise<OnboardingState>;
  completeOnboarding(): Promise<void>;
}
export interface CourseRepository {
  list(): Promise<Course[]>;
  create(course: Omit<Course, "id">): Promise<Course>;
  folders(id: string): Promise<Record<string, Note[]>>;
}
export interface NoteRepository {
  list(query?: NoteQuery): Promise<Note[]>;
  get(id: string): Promise<Note>;
  save(note: Note): Promise<Note>;
  create(data: Partial<Note>): Promise<Note>;
  comments(id: string): Promise<Comment[]>;
  comment(id: string, body: string): Promise<Comment>;
  versions(id: string): Promise<NoteVersion[]>;
  restore(id: string, versionId: string): Promise<Note>;
}
export interface ScheduleRepository {
  list(from?: string, to?: string): Promise<CourseEvent[]>;
  save(event: CourseEvent): Promise<CourseEvent>;
  lectureNotes(event: CourseEvent): Promise<Note[]>;
}
export interface ImportRepository {
  validate(file: Pick<File, "name" | "size">, kind: UploadKind): string | null;
  start(
    file: Pick<File, "name" | "size">,
    kind: UploadKind,
    scenario?: string,
  ): Promise<UploadJob>;
  confirm(job: UploadJob): Promise<void>;
}
export interface Repositories {
  auth: AuthRepository;
  courses: CourseRepository;
  notes: NoteRepository;
  schedule: ScheduleRepository;
  imports: ImportRepository;
  reset(): Promise<void>;
}
