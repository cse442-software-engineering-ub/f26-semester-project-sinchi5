// Card 241: notes are stored as cleaned HTML (card 240). These helpers turn a body into plain text for lists
// and search, and an old plain-text body (the browser demo) into paragraphs, so tags never reach the screen.
import type { Note } from "../domain";

const HTML = /<\/?(p|h[1-3]|ul|ol|li|blockquote|pre|hr|br|strong|em|u|s|mark|span|a|code)\b/i;
const BREAKS = /<\/(p|h[1-3]|li|blockquote|pre)>|<br\s*\/?>|<hr\s*\/?>/gi;

export const isHtmlBody = (body: string, format?: Note["format"]) => format !== "text" && HTML.test(body);

// Plain text of a body; the DOMParser document is inert (no scripts run, no images load).
export function plainText(body: string, format?: Note["format"]): string {
  if (!isHtmlBody(body, format)) return body;
  const doc = new DOMParser().parseFromString(body.replace(BREAKS, " $&"), "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

// What a list shows: the server's excerpt, else the body with its tags removed.
export const notePreview = (note: Pick<Note, "body" | "excerpt" | "format">) => note.excerpt ?? plainText(note.body, note.format);

// HTML for the editor: a body that is already HTML is used as is; plain text becomes escaped paragraphs.
export function editorHtml(body: string, format?: Note["format"]): string {
  if (isHtmlBody(body, format)) return body;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return body.split(/\n{2,}/).filter((p) => p.trim()).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
}
