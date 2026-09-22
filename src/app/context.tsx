import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useMemo,
  type ReactNode,
} from "react";
import { createRepositories } from "../services/repositories";
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
  const repo = useMemo(() => createRepositories(localStorage), []);
  const [state, dispatch] = useReducer(
    (s: State, a: Partial<State>) => ({ ...s, ...a }),
    initial,
  );
  async function refresh() {
    try {
      const [user, onboarding, courses, notes, events] = await Promise.all([
        repo.auth.session(),
        repo.auth.onboarding(),
        repo.courses.list(),
        repo.notes.list(),
        repo.schedule.list(),
      ]);
      dispatch({
        user,
        completed: onboarding.completed,
        courses,
        notes,
        events,
        ready: true,
      });
    } catch (e) {
      dispatch({ ready: true, error: (e as Error).message });
    }
  }
  useEffect(() => {
    void refresh();
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
