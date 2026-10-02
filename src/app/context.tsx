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
import type { User, Course, Note, CourseEvent, Repositories } from "../domain";
type State = {
  user: User | null;
  ready: boolean;
  completed: boolean;
  courses: Course[];
  notes: Note[];
  events: CourseEvent[];
  theme: string;
  error: string;
};
const initial: State = {
  user: null,
  ready: false,
  completed: false,
  courses: [],
  notes: [],
  events: [],
  theme: localStorage.getItem("notely-theme") || "system",
  error: "",
};
const Context = createContext<{
  state: State;
  repo: Repositories;
  refresh: () => Promise<void>;
  setTheme: (theme: string) => void;
  setError: (error: string) => void;
}>(null!);
export function Provider({ children }: { children: ReactNode }) {
  const repo = useMemo(() => createAppRepositories(localStorage, sessionStorage), []);
  const [state, dispatch] = useReducer(
    (s: State, a: Partial<State>) => ({ ...s, ...a }),
    initial,
  );
  const refreshVersion = useRef(0);
  async function refresh() {
    const version = ++refreshVersion.current;
    try {
      const user = await repo.auth.session();
      if (version !== refreshVersion.current) return;
      if (!user) {
        dispatch({ user: null, completed: false, courses: [], notes: [], events: [], ready: true, error: "" });
        return;
      }
      const [onboarding, courses, notes, events] = await Promise.all([
        repo.auth.onboarding(),
        repo.courses.list(),
        repo.notes.list(),
        repo.schedule.list(),
      ]);
      if (version !== refreshVersion.current) return;
      dispatch({
        user,
        completed: onboarding.completed,
        courses,
        notes,
        events,
        ready: true,
        error: "",
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
    return () => window.removeEventListener("focus", recheck);
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        state.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : state.theme);
    apply();
    media.addEventListener("change", apply);
    localStorage.setItem("notely-theme", state.theme);
    return () => media.removeEventListener("change", apply);
  }, [state.theme]);
  return (
    <Context.Provider
      value={{
        state,
        repo,
        refresh,
        setTheme: (theme) => dispatch({ theme }),
        setError: (error) => dispatch({ error }),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useApp = () => useContext(Context);
