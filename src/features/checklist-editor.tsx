import { useLayoutEffect, useRef } from "react";
import { checklistDraft, type ChecklistDraft } from "../services/checklists";
import s from "../app/App.module.css";

export function ChecklistEditor({ items, onChange, disabled }: {
  items: ChecklistDraft[];
  onChange: (items: ChecklistDraft[]) => void;
  disabled: boolean;
}) {
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const focusKey = useRef<string>();
  const addButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (focusKey.current === "add") addButton.current?.focus();
    else if (focusKey.current) inputs.current.get(focusKey.current)?.focus();
    focusKey.current = undefined;
  }, [items]);
  function add() {
    if (disabled) return;
    const [item] = checklistDraft([{ text: "", done: false }]);
    focusKey.current = item.key;
    onChange([...items, item]);
  }
  // Task #78: update by stable identity and guard all mutation paths for viewers.
  // This keeps completion/removal independent (Task Tests 2–3, Story #19 AT1–2).
  function update(key: string, patch: Partial<Pick<ChecklistDraft, "text" | "done">>) {
    if (!disabled) onChange(items.map((item) => item.key === key ? { ...item, ...patch } : item));
  }
  return <section aria-label="Checklist" className={s.checklist}>
    {items.length ? <>
      <h3>Checklist</h3>
      {items.map((item, index) => <div key={item.key} className={s.checklistRow}>
        <input type="checkbox" aria-label={`Complete ${item.text || `item ${index + 1}`}`}
          checked={item.done} disabled={disabled}
          onChange={(event) => update(item.key, { done: event.target.checked })} />
        <input type="text" aria-label={`Checklist item ${index + 1}`} value={item.text} disabled={disabled}
          className={item.done ? s.checklistDone : undefined}
          ref={(input) => { if (input) inputs.current.set(item.key, input); else inputs.current.delete(item.key); }}
          onChange={(event) => update(item.key, { text: event.target.value })}
          onKeyDown={(event) => {
            // Task #78 / Story #19 AT1: Enter focuses the next row or appends one,
            // without submitting the note or duplicating rows during key repeat/IME.
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (disabled || event.repeat) return;
            const next = items[index + 1];
            if (next) inputs.current.get(next.key)?.focus(); else add();
          }} />
        <button type="button" className={s.secondary} disabled={disabled}
          aria-label={`Remove ${item.text || `item ${index + 1}`}`}
          onClick={() => {
            if (disabled) return;
            focusKey.current = (items[index + 1] ?? items[index - 1])?.key ?? "add";
            onChange(items.filter((entry) => entry.key !== item.key));
          }}>Remove</button>
      </div>)}
    </> : null}
    <button ref={addButton} type="button" className={s.secondary} disabled={disabled} onClick={add}>
      {items.length ? "Add item" : "Add checklist"}
    </button>
  </section>;
}
