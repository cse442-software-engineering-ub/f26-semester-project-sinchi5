// Card 241: the note body editor (TipTap) and its formatting toolbar. Loaded lazily by the note editor, so
// TipTap is a chunk of its own. The HTML it produces follows the shapes card 240's server cleaner keeps.
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { mergeAttributes } from "@tiptap/core";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold, Code, Highlighter, Italic, Link, List,
  ListChecks, ListOrdered, Minus, Pilcrow, Quote, Heading1, Heading2, Heading3, Redo2, RemoveFormatting,
  Strikethrough, Underline, Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import css from "./rich-editor.module.css";

// The values card 240's cleaner accepts; anything else would be dropped when the note is saved.
export const FONTS = [
  ["Arial", "Arial, Helvetica, sans-serif"],
  ["Georgia", "Georgia, serif"],
  ["Times New Roman", '"Times New Roman", Times, serif'],
  ["Verdana", "Verdana, Geneva, sans-serif"],
  ["Trebuchet MS", '"Trebuchet MS", Helvetica, sans-serif'],
  ["Courier New", '"Courier New", Courier, monospace'],
] as const;
export const SIZES = [12, 14, 16, 18, 20, 24, 30, 36];
// Swatches are theme variables, so they follow the scheme; the chosen color is saved as the resolved hex.
const TEXT_SWATCHES = [["Default", "--text"], ["Brown", "--primary"], ["Red", "--danger"], ["Green", "--success"], ["Gray", "--muted"]];
const MARK_SWATCHES = [["Yellow", "--highlight-yellow"], ["Green", "--highlight-green"], ["Pink", "--highlight-pink"]];

const HEX = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const NAMED = /^(yellow|green|pink)$/;
const toHex = (css: string) => {
  const [r, g, b] = css.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
  return "#" + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
};

export function linkProblem(raw: string): string {
  try {
    if (["http:", "https:", "mailto:"].includes(new URL(raw.trim()).protocol)) return "";
  } catch { /* not an address */ }
  return "Use an address that starts with http://, https:// or mailto:.";
}

// A highlight keeps its color in data-color (a name from old notes, or a hex that is also set as the background).
const NoteHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const attr = el.getAttribute("data-color") || el.style.backgroundColor;
          return attr?.startsWith("rgb") ? toHex(attr) : attr || null;
        },
        renderHTML: (a: { color?: string | null }) =>
          a.color && HEX.test(a.color) ? { "data-color": a.color, style: `background-color: ${a.color}` }
            : a.color && NAMED.test(a.color) ? { "data-color": a.color } : {},
      },
    };
  },
});

// Checklist items are written as <li data-type="taskItem" data-checked="…"><p>…</p></li>, with no label or div wrapper.
const NoteTaskItem = TaskItem.extend({
  renderHTML({ HTMLAttributes }) {
    return ["li", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { "data-type": "taskItem" }), 0];
  },
});

const extensions = [
  StarterKit.configure({ trailingNode: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false, protocols: ["mailto"] } }),
  TextStyle, Color, FontFamily, FontSize, NoteHighlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TaskList, NoteTaskItem.configure({ nested: false }),
];

type Run = (e: Editor) => boolean;
type Tool = { label: string; icon: LucideIcon; run: Run; on?: (e: Editor) => boolean; off?: (e: Editor) => boolean };
const chain = (e: Editor) => e.chain().focus();
const align = (a: string): Pick<Tool, "run" | "on"> => ({ run: (e) => chain(e).setTextAlign(a).run(), on: (e) => e.isActive({ textAlign: a }) });
const TOOLS: (Tool | "|" | "font" | "size" | "color" | "highlight" | "link")[] = [
  { label: "Bold", icon: Bold, run: (e) => chain(e).toggleBold().run(), on: (e) => e.isActive("bold") },
  { label: "Italic", icon: Italic, run: (e) => chain(e).toggleItalic().run(), on: (e) => e.isActive("italic") },
  { label: "Underline", icon: Underline, run: (e) => chain(e).toggleUnderline().run(), on: (e) => e.isActive("underline") },
  { label: "Strikethrough", icon: Strikethrough, run: (e) => chain(e).toggleStrike().run(), on: (e) => e.isActive("strike") },
  { label: "Paragraph", icon: Pilcrow, run: (e) => chain(e).setParagraph().run(), on: (e) => e.isActive("paragraph") },
  { label: "Heading 1", icon: Heading1, run: (e) => chain(e).toggleHeading({ level: 1 }).run(), on: (e) => e.isActive("heading", { level: 1 }) },
  { label: "Heading 2", icon: Heading2, run: (e) => chain(e).toggleHeading({ level: 2 }).run(), on: (e) => e.isActive("heading", { level: 2 }) },
  { label: "Heading 3", icon: Heading3, run: (e) => chain(e).toggleHeading({ level: 3 }).run(), on: (e) => e.isActive("heading", { level: 3 }) },
  "|", "font", "size", "|", "color", "highlight", "|",
  { label: "Bulleted list", icon: List, run: (e) => chain(e).toggleBulletList().run(), on: (e) => e.isActive("bulletList") },
  { label: "Numbered list", icon: ListOrdered, run: (e) => chain(e).toggleOrderedList().run(), on: (e) => e.isActive("orderedList") },
  { label: "Checklist", icon: ListChecks, run: (e) => chain(e).toggleTaskList().run(), on: (e) => e.isActive("taskList") },
  "|",
  { label: "Align left", icon: AlignLeft, ...align("left") },
  { label: "Align center", icon: AlignCenter, ...align("center") },
  { label: "Align right", icon: AlignRight, ...align("right") },
  { label: "Justify", icon: AlignJustify, ...align("justify") },
  "|",
  { label: "Quote", icon: Quote, run: (e) => chain(e).toggleBlockquote().run(), on: (e) => e.isActive("blockquote") },
  { label: "Code", icon: Code, run: (e) => chain(e).toggleCode().run(), on: (e) => e.isActive("code") },
  "link",
  { label: "Horizontal rule", icon: Minus, run: (e) => chain(e).setHorizontalRule().run() },
  "|",
  { label: "Undo", icon: Undo2, run: (e) => chain(e).undo().run(), off: (e) => !e.can().undo() },
  { label: "Redo", icon: Redo2, run: (e) => chain(e).redo().run(), off: (e) => !e.can().redo() },
  { label: "Clear formatting", icon: RemoveFormatting, run: (e) => chain(e).unsetAllMarks().clearNodes().unsetTextAlign().run() },
];
// The toolbar groups, in order: text style, font and size, color and highlight, lists, align, insert, history.
const GROUP_NAMES = ["Text style", "Font and size", "Color and highlight", "Lists", "Alignment", "Insert", "History"];
const BUTTONS = TOOLS.filter((t): t is Tool => typeof t === "object");

// The computed color of a theme variable, as #rrggbb.
function resolve(token: string, root: HTMLElement) {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  root.append(probe);
  const value = toHex(getComputedStyle(probe).color);
  probe.remove();
  return value;
}

function Toolbar({ editor }: { editor: Editor }) {
  const [panel, setPanel] = useState<"" | "color" | "highlight" | "link">("");
  const [href, setHref] = useState("");
  const [problem, setProblem] = useState("");
  const bar = useRef<HTMLDivElement>(null);
  const now = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      on: BUTTONS.map((b) => b.on?.(e) ?? false), off: BUTTONS.map((b) => b.off?.(e) ?? false),
      font: (e.getAttributes("textStyle").fontFamily as string) ?? "", size: (e.getAttributes("textStyle").fontSize as string) ?? "",
      highlighted: e.isActive("highlight"), linked: e.isActive("link"),
    }),
  });
  const toggle = (name: typeof panel) => {
    setProblem("");
    if (name === "link" && panel !== "link") setHref(editor.getAttributes("link").href ?? "");
    setPanel(panel === name ? "" : name);
  };
  const pick = (kind: "color" | "highlight", value: string) => {
    if (kind === "color") value ? chain(editor).setColor(value).run() : chain(editor).unsetColor().run();
    else value ? chain(editor).setHighlight({ color: value }).run() : chain(editor).unsetHighlight().run();
  };
  const fromToken = (kind: "color" | "highlight", token: string) => pick(kind, token === "--text" ? "" : resolve(token, bar.current!));
  function applyLink(ev: FormEvent) {
    ev.preventDefault();
    const bad = linkProblem(href);
    setProblem(bad);
    if (bad) return;
    const address = href.trim();
    if (editor.state.selection.empty && !editor.isActive("link")) {
      editor.chain().focus().insertContent({ type: "text", text: address, marks: [{ type: "link", attrs: { href: address } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: address }).run();
    }
    setPanel("");
  }
  const opener = (name: "color" | "highlight" | "link", label: string, Icon: Tool["icon"], pressed?: boolean) => (
    <button key={name} type="button" className={css.tool} title={label} aria-label={label} aria-expanded={panel === name}
      aria-pressed={pressed} onClick={() => toggle(name)}>
      <Icon size={18} aria-hidden />
    </button>
  );
  const swatches = (kind: "color" | "highlight", list: string[][]) => (
    <div className={css.panel} role="group" aria-label={kind === "color" ? "Text color" : "Highlight color"}>
      {list.map(([name, token]) => (
        <button key={token} type="button" className={css.swatch} style={{ background: `var(${token})` }}
          title={name} aria-label={`${kind === "color" ? "Text" : "Highlight"} ${name.toLowerCase()}`}
          onClick={() => fromToken(kind, token)} />
      ))}
      <label className={css.custom}>
        Custom
        <input type="color" aria-label={kind === "color" ? "Custom text color" : "Custom highlight color"}
          defaultValue={resolve(kind === "color" ? "--text" : "--highlight-yellow", document.body)}
          onChange={(ev) => pick(kind, ev.target.value)} />
      </label>
      {kind === "highlight" && <button type="button" className={css.textButton} onClick={() => pick("highlight", "")}>Remove highlight</button>}
    </div>
  );
  let b = -1;
  const groups: Exclude<(typeof TOOLS)[number], "|">[][] = [[]];
  for (const t of TOOLS) { if (t === "|") groups.push([]); else groups.at(-1)!.push(t); }
  return (
    <div className={css.toolbarWrap} onMouseDown={(ev) => { if ((ev.target as HTMLElement).closest("button")) ev.preventDefault(); }}>
      <div className={css.toolbar} role="toolbar" aria-label="Formatting" ref={bar}>
        {groups.map((group, gi) => (
          <div key={gi} className={css.group} role="group" aria-label={GROUP_NAMES[gi]}>
        {group.map((t) => {
          if (t === "font") return (
            <select key={t} className={css.select} aria-label="Font family" value={FONTS.find((f) => f[1] === now.font)?.[1] ?? ""}
              onChange={(ev) => ev.target.value ? chain(editor).setFontFamily(ev.target.value).run() : chain(editor).unsetFontFamily().run()}>
              <option value="">Font</option>
              {FONTS.map(([name, value]) => <option key={name} value={value}>{name}</option>)}
            </select>
          );
          if (t === "size") return (
            <select key={t} className={css.select} aria-label="Font size" value={SIZES.map((n) => `${n}px`).find((n) => n === now.size) ?? ""}
              onChange={(ev) => ev.target.value ? chain(editor).setFontSize(ev.target.value).run() : chain(editor).unsetFontSize().run()}>
              <option value="">Size</option>
              {SIZES.map((n) => <option key={n} value={`${n}px`}>{n}</option>)}
            </select>
          );
          if (t === "color") return opener("color", "Text color", Baseline);
          if (t === "highlight") return opener("highlight", "Highlight color", Highlighter, now.highlighted);
          if (t === "link") return opener("link", "Link", Link, now.linked);
          const n = ++b;
          return (
            <button key={t.label} type="button" className={css.tool} title={t.label} aria-label={t.label}
              aria-pressed={t.on ? now.on[n] : undefined} disabled={now.off[n]} onClick={() => t.run(editor)}>
              <t.icon size={18} aria-hidden />
            </button>
          );
        })}
          </div>
        ))}
      </div>
      {panel === "color" && swatches("color", TEXT_SWATCHES)}
      {panel === "highlight" && swatches("highlight", MARK_SWATCHES)}
      {panel === "link" && (
        <form className={css.panel} onSubmit={applyLink}>
          <label className={css.custom}>
            Link address
            <input type="text" inputMode="url" autoComplete="off" value={href} placeholder="https://" onChange={(ev) => setHref(ev.target.value)} />
          </label>
          <button type="submit" className={css.textButton}>Apply link</button>
          <button type="button" className={css.textButton} onClick={() => { chain(editor).extendMarkRange("link").unsetLink().run(); setPanel(""); }}>Remove link</button>
          {problem && <p role="alert" className={css.problem}>{problem}</p>}
        </form>
      )}
    </div>
  );
}

export default function RichEditor({ html, editable, label, onChange }: {
  html: string; editable: boolean; label: string; onChange?: (html: string) => void;
}) {
  const changed = useRef(onChange);
  changed.current = onChange;
  const editor = useEditor({
    extensions, content: html, editable,
    editorProps: { attributes: { "aria-label": label, "aria-multiline": "true", role: "textbox", "data-placeholder": "Start anywhere. This space is yours…" } },
    onUpdate: ({ editor: e }) => changed.current?.(e.getHTML()),
  }, []);
  useEffect(() => { editor?.setEditable(editable, false); }, [editor, editable]);
  if (!editor) return null;
  return (
    <div className={css.editor}>
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className={css.content} />
    </div>
  );
}
