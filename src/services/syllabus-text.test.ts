import { describe, expect, it } from "vitest";
import { documentText, pdfLines, SyllabusFileError, syllabusText, zipEntries } from "./syllabus-text";
import { extractEvents } from "./syllabus";

const bytes = (text: string) => new TextEncoder().encode(text);
const concat = (...arrays: Uint8Array[]) => {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  arrays.reduce((at, a) => (out.set(a, at), at + a.length), 0);
  return out;
};
const deflated = async (data: Uint8Array) =>
  new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
// A zip archive built here, so the tests need no fixture files. CRCs stay 0: the reader doesn't use them.
async function zipOf(files: Record<string, string>, deflate = true) {
  const entries: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = bytes(content);
    const data = deflate ? await deflated(raw) : raw;
    const header = new DataView(new ArrayBuffer(26));
    header.setUint16(0, 20, true);
    header.setUint16(4, deflate ? 8 : 0, true);
    header.setUint32(14, data.length, true);
    header.setUint32(18, raw.length, true);
    header.setUint16(22, name.length, true);
    const tail = new DataView(new ArrayBuffer(14));
    tail.setUint32(10, offset, true);
    const entry = concat(bytes("PK\x03\x04"), new Uint8Array(header.buffer), bytes(name), data);
    directory.push(concat(bytes("PK\x01\x02"), new Uint8Array([20, 0]), new Uint8Array(header.buffer), new Uint8Array(tail.buffer), bytes(name)));
    entries.push(entry);
    offset += entry.length;
  }
  const dir = concat(...directory);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, directory.length, true);
  end.setUint16(10, directory.length, true);
  end.setUint32(12, dir.length, true);
  end.setUint32(16, offset, true);
  return concat(...entries, dir, new Uint8Array(end.buffer));
}
const file = (name: string, bytes: Uint8Array | string) => new File([bytes as BlobPart], name);
const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const cell = (text: string) => `<w:tc>${paragraph(text)}</w:tc>`;
const xml = `<w:document><w:body>${paragraph("CSE 442 Schedule")}<w:tbl>
  <w:tr>${cell("Week")}${cell("Date")}${cell("Due")}</w:tr>
  <w:tr>${cell("6")}${cell("October 14, 2026")}${cell("Midterm exam &amp; review")}</w:tr>
</w:tbl>${paragraph("Final project<w:tab/>due December 4, 2026 at 11:59 PM")}</w:body></w:document>`;

describe("syllabus text in the browser (card 44)", () => {
  it("reads a Word document's paragraphs, and each table row as one line", async () => {
    const expected = "CSE 442 Schedule\nWeek | Date | Due\n6 | October 14, 2026 | Midterm exam & review\n"
      + "Final project due December 4, 2026 at 11:59 PM";
    for (const deflate of [true, false]) {
      const docx = await zipOf({ "[Content_Types].xml": "<Types/>", "word/document.xml": xml }, deflate);
      expect(await syllabusText(file("syllabus.docx", docx))).toBe(expected);
    }
    // The rules then read the rows like any other lines.
    expect(extractEvents(documentText(xml), 2026).map((e) => [e.title, e.date])).toEqual([
      ["Midterm exam & review", "2026-10-14"],
      ["Final project", "2026-12-04"],
    ]);
  });

  it("refuses Word files it can't open, without unpacking more than 20 MB", async () => {
    const unreadable = "This DOCX file could not be read. Try saving it as a PDF.";
    for (const docx of [
      await zipOf({ "word/other.xml": xml }),
      bytes("PK\x03\x04 not really a zip"),
      await zipOf({ "word/document.xml": "a".repeat(21 * 1024 * 1024) }),
    ]) {
      const error = await syllabusText(file("syllabus.docx", docx)).catch((e) => e);
      expect(error).toBeInstanceOf(SyllabusFileError);
      expect(error.message).toBe(unreadable);
    }
    expect(zipEntries(bytes("plain text"))).toBeNull();
    expect([...zipEntries(await zipOf({ "a.txt": "a", "word/document.xml": xml }))!.keys()]).toEqual(["a.txt", "word/document.xml"]);
  });

  it("rebuilds PDF lines from positioned text, so table rows stay together", () => {
    const item = (str: string, x: number, y: number, width = str.length * 6) =>
      ({ str, transform: [12, 0, 0, 12, x, y], width, height: 12 });
    expect(pdfLines([
      item("Midterm", 200, 700), item("exam", 248, 700.4),
      item("Oct 14", 72, 700), item("Week 6", 400, 699),
      item("Home", 72, 680, 30), item("work 1 due Sep 28", 102, 680),
      item("  ", 72, 660), item("CSE 442", 72, 760),
    ])).toEqual(["CSE 442", "Oct 14   Midterm exam   Week 6", "Homework 1 due Sep 28"]);
  });

  it("reads text files as they are, and finds no text in a photo", async () => {
    expect(await syllabusText(file("week-1.md", "# Week 1\nQuiz 1 on September 8"))).toBe("# Week 1\nQuiz 1 on September 8");
    expect(await syllabusText(file("scan.png", "\x89PNG"))).toBe("");
  });
});
