import { describe, expect, it } from "vitest";
import { fileTypeProblem, zipEntries } from "./syllabus-file";

const bytes = (text: string) => new TextEncoder().encode(text);
const concat = (...arrays: Uint8Array[]) => {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  arrays.reduce((at, a) => (out.set(a, at), at + a.length), 0);
  return out;
};
// A zip archive built here, so the tests need no fixture files. CRCs stay 0: the check doesn't use them.
function zipOf(files: Record<string, string>) {
  const entries: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = bytes(content);
    const header = new DataView(new ArrayBuffer(26));
    header.setUint16(0, 20, true);
    header.setUint32(14, data.length, true);
    header.setUint32(18, data.length, true);
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
const file = (name: string, content: Uint8Array | string) => new File([content as BlobPart], name);

describe("syllabus file checks in the browser (card 45)", () => {
  it("lists a zip's files, and isn't fooled by other bytes", () => {
    expect(zipEntries(bytes("plain text"))).toBeNull();
    expect([...zipEntries(zipOf({ "a.txt": "a", "word/document.xml": "<w:document/>" }))!]).toEqual(["a.txt", "word/document.xml"]);
  });

  it("accepts a real Word file and text in any encoding, and refuses macros and renamed files", async () => {
    const word = zipOf({ "word/document.xml": "<w:document/>" });
    expect(await fileTypeProblem(file("syllabus.docx", word))).toBeNull();
    expect(await fileTypeProblem(file("week-1.md", "# Week 1"))).toBeNull();
    expect(await fileTypeProblem(file("syllabus.docx", zipOf({ "word/document.xml": "<w:document/>", "word/vbaProject.bin": "x" }))))
      .toBe("This Word file contains macros, which Notely doesn't accept. Save it as a regular .docx or as a PDF.");
    expect(await fileTypeProblem(file("syllabus.pdf", word))).toBe("This file is named .pdf, but it is really a Word document. Rename it to end in .docx, then choose it again.");
    expect(await fileTypeProblem(file("syllabus.txt", word))).toBe("This file is named .txt, but it is really a Word document. Rename it to end in .docx, then choose it again.");
  });
});
