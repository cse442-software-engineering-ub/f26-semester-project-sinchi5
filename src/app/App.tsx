import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { Menu } from "@base-ui/react/menu";
import {
  BookOpen,
  Sun,
  CalendarDays,
  ClipboardList,
  Files,
  GraduationCap,
  Settings as SettingsIcon,
  Plus,
  UploadCloud,
  Camera,
  FileText,
  X,
  LogOut,
  Users,
  Ellipsis,
} from "lucide-react";
import { useApp } from "./context";
import { Dashboard } from "../features/dashboard";
import { Schedule, EventDialog } from "../features/schedule";
import { Assignments } from "../features/assignments";
import { Notes } from "../features/notes-list";
import { NoteWorkspace } from "../features/note-editor";
import { CoursePage } from "../features/course-page";
import { Settings } from "../features/settings";
import { Friends } from "../features/friends";
import { Onboarding } from "../features/onboarding";
import { ImportDialog } from "../features/imports";
import { BRAND, type UploadKind } from "../domain";
import { AddCourseDialog } from "../features/course-dialog";
import { Avatar } from "../shared/ui";
import { Courses } from "../features/courses";
import s from "../shared/ui.module.css";
import sh from "./shell.module.css";
const nav = [
  { to: "/", label: "Today", icon: Sun },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/assignments", label: "Assignments", icon: ClipboardList },
  { to: "/notes", label: "Notes", icon: Files },
  { to: "/courses", label: "Courses", icon: GraduationCap },
  { to: "/friends", label: "Friends", icon: Users },
];
const tabs = nav.filter((n) => ["Today", "Schedule", "Notes", "Courses"].includes(n.label));
const more = nav.filter((n) => ["Assignments", "Friends"].includes(n.label));
// Card 248: the fifth click on the logo within 2 s gives it a quick flourish.
function useLogoFlourish() {
  const clicks = useRef<number[]>([]);
  const [on, setOn] = useState(false);
  const click = () => {
    const now = Date.now();
    clicks.current = [...clicks.current.filter((t) => now - t < 2000), now];
    if (clicks.current.length < 5) return;
    clicks.current = [];
    setOn(true);
    setTimeout(() => setOn(false), 700);
  };
  return { click, mark: { "data-flourish": on ? "" : undefined } };
}
export default function App() {
  const logo = useLogoFlourish();
  const { state, repo, refresh, setError } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [importKind, setImportKind] = useState<UploadKind>();
  const [event, setEvent] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [addingCourse, setAddingCourse] = useState(false);
  // Bug 3: after Log out the signed-out redirect always lands on the log-in form, from any page.
  const [loggedOut, setLoggedOut] = useState(false);
  // An account left mid-setup goes straight in; one background request, retried at the next load.
  const setupTried = useRef(false);
  const newAccount = Boolean(location.state?.newAccount);
  useEffect(() => {
    if (!state.user || state.completed || newAccount || setupTried.current) return;
    setupTried.current = true;
    repo.auth.completeOnboarding().then(() => refresh(), () => {});
  }, [state.user, state.completed, newAccount]);
  useEffect(() => {
    document.title = `${BRAND} · ${location.pathname.startsWith("/notes") ? "Your notes" : location.pathname.startsWith("/schedule") ? "Your schedule" : "Your study space"}`;
    window.scrollTo(0, 0);
  }, [location.pathname]);
  async function create() {
    try {
      const n = await repo.notes.create({});
      await refresh();
      navigate(`/notes/${n.id}`, { state: { newNote: true } });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      await repo.auth.signOut();
      setLoggedOut(true);
      await refresh();
      navigate("/welcome?mode=signin", { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSigningOut(false);
    }
  }
  const user = state.user;
  const newItems = [
    ["Note", FileText, () => void create()],
    ["Event", CalendarDays, () => setEvent(true)],
    ["Course", GraduationCap, () => setAddingCourse(true)],
    ["Upload syllabus", BookOpen, () => setImportKind("syllabus")],
    ["Upload document", UploadCloud, () => setImportKind("document")],
    ["Scan photos", Camera, () => setImportKind("scan")],
  ] as const;
  const newMenu = (className: string, side: "bottom" | "top", align: "start" | "end") => (
    <Menu.Root>
      <Menu.Trigger className={className} aria-label="New" title="New">
        <Plus size={18} />
        <span className={sh.label}>New</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side={side} align={align} sideOffset={8}>
          <Menu.Popup className={sh.menu}>
            {newItems.map(([label, Icon, fn]) => (
              <Menu.Item key={label} className={sh.menuItem} onClick={fn}>
                <Icon size={18} />
                {label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
  const accountMenu = (className: string, side: "bottom" | "top", showName: boolean) =>
    user && (
      <Menu.Root>
        <Menu.Trigger className={className} aria-label={user.name} title={user.name}>
          <Avatar user={user} version={state.photoVersion} alt="" />
          {showName && <span>{user.name}</span>}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side={side} align={side === "bottom" ? "end" : "start"} sideOffset={8}>
            <Menu.Popup className={sh.menu}>
              <Menu.Item className={sh.menuItem} render={<Link to="/settings" />}>
                <SettingsIcon size={18} />
                Settings
              </Menu.Item>
              <Menu.Item className={sh.menuItem} disabled={signingOut} onClick={() => void signOut()}>
                <LogOut size={18} />
                {signingOut ? "Logging out…" : "Log out"}
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    );
  const moreActive = more.some((n) => location.pathname.startsWith(n.to));
  if (!state.ready)
    return (
      <div className={sh.boot} role="status">
        <BookOpen size={32} /> Opening your space…
      </div>
    );
  if (!state.user || (!state.completed && newAccount))
    return (
      <Routes>
        <Route path="/welcome" element={<Onboarding />} />
        <Route
          path="*"
          element={
            <Navigate
              to={location.pathname === "/" && !loggedOut ? "/welcome" : "/welcome?mode=signin"}
              replace
            />
          }
        />
      </Routes>
    );
  return (
    <div className={sh.app} key={state.user.id}>
      <a
        href="#main"
        className={sh.skip}
        onClick={(event) => {
          // Focus content without replacing a hash-based page route.
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className={sh.sidebar}>
        <Link to="/" className={sh.brand} title={BRAND} onClick={logo.click}>
          <span className={sh.brandMark} {...logo.mark}>
            <BookOpen size={18} />
          </span>
          <span className={sh.label}>{BRAND}</span>
        </Link>
        {newMenu(sh.newButton, "bottom", "start")}
        <nav className={sh.nav} aria-label="Main navigation">
          {nav.map(({ to, label, icon: Icon }) => (
            <div key={to}>
              <NavLink to={to} end={to === "/" || to === "/courses"} className={sh.navItem} title={label}>
                <Icon size={19} />
                <span className={sh.label}>{label}</span>
              </NavLink>
              {label === "Courses" && state.courses.length > 0 && (
                <div className={sh.courseList}>
                  {state.courses.map((c) => (
                    <NavLink key={c.id} to={`/courses/${c.id}`} className={sh.courseItem}>
                      <i className={sh.dot} style={{ background: c.color }} />
                      <span>{c.code}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        {accountMenu(sh.account, "top", true)}
      </aside>
      <div className={sh.mainWrap}>
        <header className={sh.topbar}>
          <Link to="/" className={sh.brand} onClick={logo.click}>
            <span className={sh.brandMark} {...logo.mark}>
              <BookOpen size={18} />
            </span>
            {BRAND}
          </Link>
          {accountMenu(sh.account, "bottom", false)}
        </header>
        <main id="main" tabIndex={-1} className={sh.main}>
          {state.error && (
            <div className={s.error} role="alert">
              {state.error}
              <button
                className={s.iconButton}
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className={sh.page} key={location.pathname.split("/")[1]}>
          <Routes>
            <Route path="/welcome" element={<Navigate to="/" replace />} />
            <Route
              path="/"
              element={
                <Dashboard
                  onImport={setImportKind}
                  onCreate={() => void create()}
                  onAddCourse={() => setAddingCourse(true)}
                />
              }
            />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/assignments" element={<Assignments />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/notes/:id" element={<NoteWorkspace />} />
            <Route path="/courses" element={<Courses onAddCourse={() => setAddingCourse(true)} />} />
            <Route path="/courses/:id" element={<CoursePage />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </div>
        </main>
      </div>
      <nav className={sh.tabbar} aria-label="Mobile navigation">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/" || to === "/courses"} className={sh.tab}>
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
        <Menu.Root>
          <Menu.Trigger className={sh.tab} data-active={moreActive} aria-current={moreActive ? "page" : undefined}>
            <Ellipsis size={20} />
            <span>More</span>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="top" align="end" sideOffset={8}>
              <Menu.Popup className={sh.menu}>
                {more.map(({ to, label, icon: Icon }) => (
                  <Menu.Item key={to} className={sh.menuItem} render={<Link to={to} />}>
                    <Icon size={18} />
                    {label}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </nav>
      {newMenu(sh.fab, "top", "end")}
      {addingCourse && (
        <AddCourseDialog onClose={() => setAddingCourse(false)} />
      )}

      {importKind && (
        <ImportDialog
          kind={importKind}
          onClose={() => setImportKind(undefined)}
        />
      )}
      {event && <EventDialog onClose={() => setEvent(false)} />}
    </div>
  );
}
