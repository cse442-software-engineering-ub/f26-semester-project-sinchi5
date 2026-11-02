// Card 45: catches a renamed or damaged syllabus in the browser, before anything uploads, with a message
// that says how to fix it. The server's reader (card 127) does the reading.
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
