import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useReducer,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { createAppRepositories } from "../services/app-repositories";
import { createReminderScheduler, showNoteNotification } from "../services/note-reminders";
import { buildPalette, PALETTE_VARIABLES } from "../services/palette";
import type { User, Course, Note, CourseEvent, Repositories, Preferences, ThemeInput } from "../domain";
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
  saveTheme: (theme: ThemeInput) => Promise<Preferences>;
  deleteTheme: (id: string) => Promise<Preferences>;
  setError: (error: string) => void;
  holdRefresh: () => () => void;
}>(null!);
export function Provider({ children }: { children: ReactNode }) {
  const repo = useMemo(() => createAppRepositories(), []);
  const reminders = useMemo(() => createReminderScheduler(showNoteNotification), []);
  const [state, dispatch] = useReducer(
    (s: State, a: Partial<State>) => ({ ...s, ...a }),
    initial,
  );
  const refreshVersion = useRef(0);
  const photoVersion = useRef(0);
  const saving = useRef(0);
  // Card 257: forms with unsaved changes hold the background re-read; one runs when the last hold lets go.
  const holds = useRef(0);
  const missed = useRef(false);
  const refreshRef = useRef<() => Promise<void>>();
  const holdRefresh = useCallback(() => {
    holds.current++;
    return () => {
      if (--holds.current === 0 && missed.current) { missed.current = false; void refreshRef.current?.(); }
    };
  }, []);
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
  refreshRef.current = refresh;
  useEffect(() => {
    void refresh();
    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      if (holds.current > 0) missed.current = true; else void refresh();
    };
    window.addEventListener("focus", recheck);
    // Card 142: changes made on another device show up within 30 seconds while this tab is visible.
    const timer = setInterval(recheck, 30000);
    return () => { window.removeEventListener("focus", recheck); clearInterval(timer); };
  }, []);
  useEffect(() => {
    reminders.update(state.user ? state.notes : []);
  }, [reminders, state.user, state.notes]);
  useEffect(() => () => reminders.dispose(), [reminders]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const { mode, scheme } = state.preferences;
    const apply = () => {
      document.documentElement.dataset.theme = mode === "system" ? (media.matches ? "dark" : "light") : mode;
      const root = document.documentElement;
      const custom = scheme.startsWith("custom:") ? state.preferences.customThemes?.find((t) => `custom:${t.id}` === scheme) : undefined;
      root.dataset.scheme = scheme.startsWith("custom:") && !custom ? "sage" : scheme;
      // A custom theme sets its whole palette for the current mode inline; any other scheme removes it.
      const palette: Record<string, string> = custom ? buildPalette(custom)[root.dataset.theme === "dark" ? "dark" : "light"] : {};
      for (const name of PALETTE_VARIABLES) {
        if (name in palette) root.style.setProperty(name, palette[name]); else root.style.removeProperty(name);
      }
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
  // Theme routes answer with the whole saved choice; a save in flight keeps a refresh from overwriting it.
  async function themeRequest(call: () => Promise<Preferences>) {
    saving.current++;
    try { const saved = await call(); dispatch({ preferences: saved }); return saved; }
    finally { saving.current--; }
  }
  return (
    <Context.Provider
      value={{
        state,
        repo,
        refresh,
        holdRefresh,
        setPreferences,
        saveTheme: (theme) => themeRequest(() => repo.auth.saveTheme(theme)),
        deleteTheme: (id) => themeRequest(() => repo.auth.deleteTheme(id)),
        setError: (error) => dispatch({ error }),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useApp = () => useContext(Context);
// While `held` is true (unsaved changes, or a form that is open) the 30-second and tab-focus re-reads wait.
export function useHoldRefresh(held: boolean) {
  const { holdRefresh } = useApp();
  useEffect(() => (held ? holdRefresh() : undefined), [held, holdRefresh]);
}
