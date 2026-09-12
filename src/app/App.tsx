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
  Files,
  Settings as SettingsIcon,
  Plus,
  Search,
  UploadCloud,
  Camera,
  FileText,
  ChevronDown,
  ArrowUpRight,
  X,
} from "lucide-react";
import { useApp } from "./context";
import { Dashboard } from "../features/dashboard";
import { Schedule, EventDialog } from "../features/schedule";
import { Notes, NoteWorkspace, CoursePage } from "../features/notes";
import { Settings } from "../features/settings";
import { Onboarding } from "../features/onboarding";
import { ImportDialog } from "../features/imports";
import { BRAND, type UploadKind } from "../domain";
import s from "./App.module.css";
const nav = [
  { to: "/", label: "Today", icon: Sun },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/notes", label: "Notes", icon: Files },
];
export default function App() {
  const { state, repo, refresh, setError } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [importKind, setImportKind] = useState<UploadKind>();
  const [event, setEvent] = useState(false);
  useEffect(() => {
    document.title = `${BRAND} · ${location.pathname.startsWith("/notes") ? "Your notes" : location.pathname.startsWith("/schedule") ? "Your schedule" : "Your study space"}`;
    window.scrollTo(0, 0);
  }, [location.pathname]);
  async function create() {
    try {
      const n = await repo.notes.create({});
      await refresh();
      navigate(`/notes/${n.id}`);
    } catch (e) {
      setError((e as Error).message);
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
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    );
  return (
    <div className={s.app}>
      <a href="#main" className={s.skip}>
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
        <div className={s.workspace}>
          <span className={s.avatar}>{state.user.name[0].toUpperCase()}</span>
          <span>
            <strong>My workspace</strong>
            <small>A little room to think</small>
          </span>
          <ChevronDown size={15} />
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
            <Link to="/settings" aria-label="Manage courses">
              <Plus size={15} />
            </Link>
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
        <div className={s.sideFooter}>
          <span className={s.avatar}>{state.user.name[0].toUpperCase()}</span>
          <span>
            <strong>{state.user.name}</strong>
            <small>Curious mind, always.</small>
          </span>
        </div>
      </aside>
      <div className={s.mainWrap}>
        <header className={s.topbar}>
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
              {state.user.name[0].toUpperCase()}
            </Link>
          </div>
        </header>
        <main id="main" className={s.main}>
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
            <Route
              path="/"
              element={
                <Dashboard
                  onImport={setImportKind}
                  onCreate={() => void create()}
                />
              }
            />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/notes/:id" element={<NoteWorkspace />} />
            <Route path="/courses/:id" element={<CoursePage />} />
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
      </nav>
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
