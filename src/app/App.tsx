import { useEffect, useState } from "react";
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
  Settings as SettingsIcon,
  Plus,
  Search,
  UploadCloud,
  Camera,
  FileText,
  ArrowUpRight,
  X,
  LogOut,
  Users,
} from "lucide-react";
import { useApp } from "./context";
import { Dashboard } from "../features/dashboard";
import { Schedule, EventDialog } from "../features/schedule";
import { Assignments } from "../features/assignments";
import { Notes, NoteWorkspace, CoursePage } from "../features/notes";
import { Settings } from "../features/settings";
import { Friends } from "../features/friends";
import { Onboarding } from "../features/onboarding";
import { ImportDialog } from "../features/imports";
import { BRAND, type UploadKind } from "../domain";
import { AddCourseDialog } from "../features/course-dialog";
import { Avatar } from "../shared/ui";
import s from "./App.module.css";
const nav = [
  { to: "/", label: "Today", icon: Sun },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/assignments", label: "Assignments", icon: ClipboardList },
  { to: "/notes", label: "Notes", icon: Files },
  { to: "/friends", label: "Friends", icon: Users },
];
export default function App() {
  const { state, repo, refresh, setError } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [importKind, setImportKind] = useState<UploadKind>();
  const [event, setEvent] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [addingCourse, setAddingCourse] = useState(false);
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
      await refresh();
      navigate("/welcome?mode=signin", { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSigningOut(false);
    }
  }
  if (!state.ready)
    return (
      <div className={s.boot} role="status">
        <BookOpen size={32} /> Opening your space…
      </div>
    );
  if (!state.user || !state.completed)
    return (
      <Routes>
        <Route path="/welcome" element={<Onboarding />} />
        <Route
          path="*"
          element={
            <Navigate
              to={location.pathname === "/" ? "/welcome" : "/welcome?mode=signin"}
              replace
            />
          }
        />
      </Routes>
    );
  return (
    <div className={s.app} key={state.user.id}>
      <a
        href="#main"
        className={s.skip}
        onClick={(event) => {
          // Focus content without replacing a hash-based page route.
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className={s.sidebar}>
        <Link to="/" className={s.logo}>
          <span>
            <BookOpen size={22} />
          </span>
          {BRAND}
          <i>✦</i>
        </Link>
        {/* Keep workspace details non-interactive: there is no menu to open. */}
        <div className={s.workspace}>
          <Avatar user={state.user} version={state.photoVersion} alt="" />
          <span>
            <strong>My workspace</strong>
            <small>A little room to think</small>
          </span>
        </div>
        <nav aria-label="Main navigation">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `${s.navItem} ${isActive ? s.navActive : ""}`
              }
            >
              <Icon size={19} />
              {label}
              {label === "Notes" && <small>{state.notes.length}</small>}
            </NavLink>
          ))}
        </nav>
        <div className={s.sideSection}>
          <div className={s.sideLabel}>
            YOUR COURSES{" "}
            <button
              type="button"
              aria-label="Add a course"
              onClick={() => setAddingCourse(true)}
            >
              <Plus size={15} />
            </button>
          </div>
          {state.courses.map((c) => (
            <NavLink
              className={({ isActive }) =>
                `${s.courseNav} ${isActive ? s.navActive : ""}`
              }
              to={`/courses/${c.id}`}
              key={c.id}
            >
              <i style={{ background: c.color }} />
              <span>
                {c.code}
                <small>{c.name}</small>
              </span>
            </NavLink>
          ))}
        </div>
        <button
          className={s.sideUpload}
          onClick={() => setImportKind("syllabus")}
        >
          <span>
            <UploadCloud size={19} />
          </span>
          <strong>A semester, sorted.</strong>
          <small>
            Upload a syllabus. We’ll help
            <br />
            you see what’s ahead.
          </small>
          <span className={s.textLink}>
            Add your syllabus <ArrowUpRight size={14} />
          </span>
        </button>
        <NavLink to="/settings" className={s.navItem}>
          <SettingsIcon size={18} /> Settings
        </NavLink>
        <button
          type="button"
          className={`${s.navItem} ${s.signOutNav}`}
          disabled={signingOut}
          onClick={() => void signOut()}
        >
          <LogOut size={18} /> {signingOut ? "Logging out…" : "Log out"}
        </button>
        <div className={s.sideFooter}>
          <span>
            <strong>{state.user.name}</strong>
          </span>
        </div>
      </aside>
      <div className={s.mainWrap}>
        <header className={s.topbar}>
          {/* Card 165: phones hide the left menu, so the top bar shows the name there instead. */}
          <Link to="/" className={s.topBrand}>
            <span>
              <BookOpen size={17} />
            </span>
            {BRAND}
          </Link>
          <span className={s.breadcrumb}>
            My workspace <span>/</span>{" "}
            {location.pathname === "/"
              ? "Today"
              : location.pathname.split("/")[1]}
          </span>
          <Link
            className={s.topSearch}
            to="/notes"
            aria-label="Search your space"
          >
            <Search size={16} />
            <span>Search your space</span>
          </Link>
          <div className={s.topActions}>
            <span className={s.term}>Fall semester ’26</span>
            <Menu.Root>
              <Menu.Trigger className={s.iconButton} aria-label="Create">
                <Plus size={20} />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner sideOffset={8}>
                  <Menu.Popup className={s.menu}>
                    {[
                      ["Blank note", FileText, () => void create()],
                      [
                        "Upload document",
                        UploadCloud,
                        () => setImportKind("document"),
                      ],
                      ["Scan photos", Camera, () => setImportKind("scan")],
                      [
                        "Upload syllabus",
                        BookOpen,
                        () => setImportKind("syllabus"),
                      ],
                      ["Course event", CalendarDays, () => setEvent(true)],
                    ].map(([label, Icon, fn]) => {
                      const I = Icon as typeof FileText;
                      return (
                        <Menu.Item
                          key={label as string}
                          className={s.menuItem}
                          onClick={fn as () => void}
                        >
                          <I size={17} />
                          {label as string}
                        </Menu.Item>
                      );
                    })}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
            <Link className={s.avatar} to="/settings" aria-label="Your account">
              <Avatar user={state.user} version={state.photoVersion} className={s.accountLinkAvatar} alt="Your profile photo" />
            </Link>
          </div>
        </header>
        <main id="main" tabIndex={-1} className={s.main}>
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
          <Routes>
            <Route path="/welcome" element={<Navigate to={location.state?.returningLogin ? "/notes" : "/"} replace />} />
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
            <Route path="/courses/:id" element={<CoursePage />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <footer className={s.mainFooter}>
            <span>A little more organized. A lot more headspace.</span>
            <span>
              Made for your mind. <i>✦</i>
            </span>
          </footer>
        </main>
      </div>
      <nav className={s.mobileNav} aria-label="Mobile navigation">
        {[
          ...nav,
          { to: "/settings", label: "Settings", icon: SettingsIcon },
        ].map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => (isActive ? s.navActive : "")}
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={s.signOutNav}
          disabled={signingOut}
          onClick={() => void signOut()}
        >
          <LogOut size={20} />
          <span>{signingOut ? "Logging out…" : "Log out"}</span>
        </button>
      </nav>
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
