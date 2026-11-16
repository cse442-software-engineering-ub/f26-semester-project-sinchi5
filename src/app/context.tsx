import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { createAppRepositories } from "../services/app-repositories";
import type { User, Course, Note, CourseEvent, Repositories, Preferences } from "../domain";
type State = {
  user: User | null;
  photoVersion: number;
  ready: boolean;
  completed: boolean;
  courses: Course[];
  notes: Note[];
  events: CourseEvent[];
  preferences: Preferences;
  error: string;
};
const initial: State = {
  user: null,
  photoVersion: 0,
  ready: false,
  completed: false,
  courses: [],
  notes: [],
  events: [],
  preferences: { mode: "system", scheme: "sage" },
  error: "",
};
const Context = createContext<{
  state: State;
  repo: Repositories;
  refresh: (options?: { photoChanged?: boolean }) => Promise<void>;
  setPreferences: (next: Preferences) => Promise<boolean>;
  setError: (error: string) => void;
}>(null!);
export function Provider({ children }: { children: ReactNode }) {
  const repo = useMemo(() => createAppRepositories(), []);
  const [state, dispatch] = useReducer(
    (s: State, a: Partial<State>) => ({ ...s, ...a }),
    initial,
  );
  const refreshVersion = useRef(0);
  const photoVersion = useRef(0);
  const saving = useRef(0);
  async function refresh({ photoChanged = false }: { photoChanged?: boolean } = {}) {
    // Keep invalidation even if a newer focus/session refresh supersedes this request.
    if (photoChanged) photoVersion.current++;
    const version = ++refreshVersion.current;
    try {
      const user = await repo.auth.session();
      if (version !== refreshVersion.current) return;
      if (!user) {
        dispatch({ user: null, completed: false, courses: [], notes: [], events: [], ready: true, error: "", preferences: { mode: "system", scheme: "sage" } });
        return;
      }
      const [onboarding, courses, notes, events] = await Promise.all([
        repo.auth.onboarding(),
        repo.courses.list(),
        repo.notes.list(),
        repo.schedule.list(),
      ]);
      if (version !== refreshVersion.current) return;
      // Publish the new user and photo revision together for every avatar instance.
      dispatch({
        user,
        photoVersion: photoVersion.current,
        completed: onboarding.completed,
        courses,
        notes,
        events,
        ready: true,
        error: "",
        // A save in flight owns the screen; the next refresh brings the server's answer.
        ...(saving.current ? {} : { preferences: repo.auth.preferences() }),
      });
    } catch (e) {
      if (version !== refreshVersion.current) return;
      dispatch({ user: null, completed: false, courses: [], notes: [], events: [], ready: true, error: (e as Error).message });
    }
  }
  useEffect(() => {
    void refresh();
    const recheck = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", recheck);
    // Card 142: changes made on another device show up within 30 seconds while this tab is visible.
    const timer = setInterval(recheck, 30000);
    return () => { window.removeEventListener("focus", recheck); clearInterval(timer); };
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const { mode, scheme } = state.preferences;
    const apply = () => {
      document.documentElement.dataset.theme = mode === "system" ? (media.matches ? "dark" : "light") : mode;
      document.documentElement.dataset.scheme = scheme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [state.preferences]);
  // Applies at once; on a failed save the old look comes back and the caller shows the message.
  async function setPreferences(next: Preferences) {
    const before = state.preferences;
    saving.current++;
    dispatch({ preferences: next });
    try { await repo.auth.savePreferences(next); return true; }
    catch { dispatch({ preferences: before }); return false; }
    finally { saving.current--; }
  }
  return (
    <Context.Provider
      value={{
        state,
        repo,
        refresh,
        setPreferences,
        setError: (error) => dispatch({ error }),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useApp = () => useContext(Context);
