// Card 44: gets a syllabus file's text in the browser, so the free rules in syllabus.ts can read PDFs
// and Word documents as well as TXT and Markdown. Nothing here sends the file anywhere.
import type { TextItem } from "pdfjs-dist/types/src/display/api";

// A file the student has to fix themselves; its message says how.
export class SyllabusFileError extends Error {}

const MAX_PDF_PAGES = 60;
// More text than any syllabus has, so a tiny "zip bomb" can't fill the browser's memory.
const MAX_TEXT_BYTES = 20 * 1024 * 1024;
const UNREADABLE_DOCX = "This DOCX file could not be read. Try saving it as a PDF.";

// Returns the file's text, or "" when it has none the rules could use (a photo or a scanned PDF).
export async function syllabusText(file: Blob & { name: string }): Promise<string> {
  const type = file.name.split(".").pop()?.toLowerCase();
  if (type === "txt" || type === "md") return file.text();
  if (type === "docx") return docxText(new Uint8Array(await file.arrayBuffer()));
  if (type === "pdf") return pdfText(new Uint8Array(await file.arrayBuffer()));
  return "";
}

async function pdfText(data: Uint8Array) {
  // pdf.js is large, so it downloads only when a student picks a PDF. Its worker is built as a plain
  // .js file, since a shared host may not send .mjs files with a JavaScript type.
  const [pdfjs, { default: PdfWorker }] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?worker")]);
  pdfjs.GlobalWorkerOptions.workerPort ??= new PdfWorker();
  // Only text is read: no scripts, forms, or rendering.
  const task = pdfjs.getDocument({ data, enableXfa: false });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (error) {
    await task.destroy();
    if (error instanceof pdfjs.PasswordException)
      throw new SyllabusFileError("This PDF is password-protected. Remove the password, or upload another copy.");
    // The automatic reader may still manage a PDF that pdf.js can't open.
    return "";
  }
  try {
    const lines: string[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PDF_PAGES); n++) {
      const { items } = await (await pdf.getPage(n)).getTextContent();
      lines.push(...pdfLines(items.filter((item): item is TextItem => "str" in item)));
    }
    return lines.join("\n");
  } finally {
    await task.destroy();
  }
}

// Rebuilds a page's lines from positioned pieces of text, top to bottom and left to right, so a table
// row reads as one line ("Oct 14  Midterm exam") the way the rules expect.
export function pdfLines(items: Pick<TextItem, "str" | "transform" | "width" | "height">[]): string[] {
  const rows: { y: number; size: number; parts: { x: number; end: number; str: string }[] }[] = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const [, , , scale, x, y] = item.transform as number[];
    const size = Math.abs(item.height) || Math.abs(scale) || 10;
    const part = { x, end: x + item.width, str: item.str };
    const row = rows.find((r) => Math.abs(r.y - y) < Math.min(r.size, size) / 2);
    if (row) row.parts.push(part);
    else rows.push({ y, size, parts: [part] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map(({ size, parts }) => {
      parts.sort((a, b) => a.x - b.x);
      // Pieces that touch are one word split by spacing; a gap means a space, a wide one a new column.
      return parts.reduce((line, part, i) => {
        const gap = i ? part.x - parts[i - 1].end : 0;
        return line + (i === 0 ? "" : gap > size * 2 ? "   " : gap > size * 0.15 ? " " : "") + part.str;
      }, "").trim();
    });
}

type ZipEntry = { flags: number; method: number; compressed: number; local: number };

// Lists a zip's files from its central directory, or returns null when the bytes aren't a zip.
// The same check runs on the server (zipDirectory in backend/lib/imports.php).
export function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end record sits in the last 64 KB, before an optional comment.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) return null;
  const count = view.getUint16(end + 10, true);
  // A real Word document has a few dozen files; thousands means something else.
  if (count > 5000) return null;
  const entries = new Map<string, ZipEntry>();
  const names = new TextDecoder();
  let at = view.getUint32(end + 16, true);
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) return null;
    const nameLength = view.getUint16(at + 28, true);
    entries.set(names.decode(bytes.subarray(at + 46, at + 46 + nameLength)), {
      flags: view.getUint16(at + 8, true),
      method: view.getUint16(at + 10, true),
      compressed: view.getUint32(at + 20, true),
      local: view.getUint32(at + 42, true),
    });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return entries;
}

async function docxText(bytes: Uint8Array<ArrayBuffer>) {
  const entry = zipEntries(bytes)?.get("word/document.xml");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!entry || entry.flags & 1 || entry.local + 30 > bytes.length || view.getUint32(entry.local, true) !== 0x04034b50)
    throw new SyllabusFileError(UNREADABLE_DOCX);
  const start = entry.local + 30 + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true);
  const data = bytes.subarray(start, start + entry.compressed);
  if (entry.method === 0) return documentText(new TextDecoder().decode(data));
  if (entry.method !== 8) throw new SyllabusFileError(UNREADABLE_DOCX);
  // The browser's own unzip, read in chunks so it can stop at the size limit.
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: BlobPart[] = [];
  let size = 0;
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      size += chunk.value.length;
      if (size > MAX_TEXT_BYTES) throw new SyllabusFileError(UNREADABLE_DOCX);
      chunks.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error instanceof SyllabusFileError ? error : new SyllabusFileError(UNREADABLE_DOCX);
  }
  return documentText(await new Blob(chunks).text());
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeXml = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, name: string) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()];
    const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });

// One line per paragraph; a table row is one line with " | " between its cells, like a Markdown table.
export function documentText(xml: string) {
  const strip = (part: string) =>
    part.replace(/<w:(?:tab|br|cr)\b[^>]*\/>/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return xml
    .replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (row) =>
      row.split("</w:tc>").map((cell) => strip(cell.replaceAll("</w:p>", " "))).filter(Boolean).join(" | ") + "</w:p>")
    .split("</w:p>")
    .map(strip)
    .filter(Boolean)
    .map(decodeXml)
    .join("\n");
}

const latin1 = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
// What a file really is, from its first bytes, with how to fix one that was named wrongly.
const KINDS: { type: string; is: (b: Uint8Array) => boolean; fix: string }[] = [
  { type: "PDF", is: (b) => latin1(b, 0, 1024).includes("%PDF-"), fix: "Rename it to end in .pdf, then choose it again." },
  { type: "Word document", is: (b) => zipEntries(b)?.has("word/document.xml") ?? false, fix: "Rename it to end in .docx, then choose it again." },
  { type: "JPG image", is: (b) => latin1(b, 0, 3) === "\xFF\xD8\xFF", fix: "Rename it to end in .jpg, then choose it again." },
  { type: "PNG image", is: (b) => latin1(b, 0, 8) === "\x89PNG\r\n\x1A\n", fix: "Rename it to end in .png, then choose it again." },
  { type: "WebP image", is: (b) => latin1(b, 0, 4) === "RIFF" && latin1(b, 8, 12) === "WEBP", fix: "Rename it to end in .webp, then choose it again." },
  { type: "HEIC photo", is: (b) => latin1(b, 4, 8) === "ftyp" && /^(hei|hev|mif|msf)/.test(latin1(b, 8, 12)),
    fix: "Notely can't read HEIC photos. Take a screenshot of it, or export it as a JPG." },
  { type: "older Word file (.doc) or a locked document", is: (b) => latin1(b, 0, 4) === "\xD0\xCF\x11\xE0",
    fix: "Open it in Word or Google Docs, remove any password, and save it as .docx or PDF." },
  { type: "zip archive", is: (b) => latin1(b, 0, 4) === "PK\x03\x04", fix: "Unzip it and upload the syllabus inside." },
];
const article = (type: string) => (/^[aeiou]/i.test(type) ? "an " : "a ") + type;
const EXPECTED: Record<string, string> = { pdf: "PDF", docx: "Word document", jpg: "JPG image", jpeg: "JPG image", png: "PNG image", webp: "WebP image" };

// The browser's version of the server's content check (syllabusFile in backend/lib/imports.php), so a
// renamed or damaged file is caught before uploading, with a message that says how to fix it.
export async function fileTypeProblem(file: Blob & { name: string }): Promise<string | null> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const actual = KINDS.find((kind) => kind.is(bytes));
  const expected = EXPECTED[extension];
  if (!expected) {
    // A text file in any encoding is fine; a NUL byte means it is really something else.
    if (!bytes.includes(0)) return null;
    return actual ? `This file is named .${extension}, but it is really ${article(actual.type)}. ${actual.fix}` :
      "This doesn't look like a text file. Save your syllabus as a PDF and upload that instead.";
  }
  if (actual?.type === expected) {
    if (expected === "PDF" && !latin1(bytes, Math.max(0, bytes.length - 2048), bytes.length).includes("%%EOF"))
      return "This PDF looks cut off. Download it again, then upload the new copy.";
    if (expected === "Word document" && zipEntries(bytes)?.has("word/vbaProject.bin"))
      return "This Word file contains macros, which Notely doesn't accept. Save it as a regular .docx or as a PDF.";
    return null;
  }
  if (actual) return `This file is named .${extension}, but it is really ${article(actual.type)}. ${actual.fix}`;
  return `This doesn't look like a real ${expected}. Open it and save or export it again as a PDF, then upload that.`;
}
