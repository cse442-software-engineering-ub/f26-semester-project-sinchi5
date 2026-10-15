<?php
declare(strict_types=1);
// Card 43 upload checks. No database or network needed: php backend/tests/syllabus-upload.php
ini_set('memory_limit', '512M');
require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/notes.php';
require_once __DIR__ . '/../lib/imports.php';

function check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}
function rejects(array $input, int $status, string $message): void
{
    try {
        syllabusFile($input);
    } catch (HttpError $error) {
        check($error->status === $status && $error->getMessage() === $message,
            "Expected $status \"$message\", got {$error->status} \"{$error->getMessage()}\".");
        return;
    }
    throw new RuntimeException("Expected the upload to be rejected with \"$message\".");
}
$file = fn (string $name, string $bytes) => ['fileName' => $name, 'content' => base64_encode($bytes)];

// Task test 1: each supported type is accepted when its first bytes match its name.
foreach ([
    ['cse442-syllabus.txt', "CSE 442 Software Engineering - Fall 2026 Syllabus\nHomework 1 due September 28, 2026\n", 'txt'],
    ['week-1.md', "# Week 1\nQuiz 1 on September 8\n", 'md'],
    ['syllabus.pdf', "%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", 'pdf'],
    ['syllabus.docx', "PK\x03\x04\x14\x00", 'docx'],
    ['scan.JPEG', "\xFF\xD8\xFF\xE0\x00\x10JFIF", 'jpg'],
    ['scan.png', "\x89PNG\r\n\x1A\n\x00\x00\x00\x0DIHDR", 'png'],
    ['scan.webp', "RIFF\x24\x00\x00\x00WEBPVP8 ", 'webp'],
    ['Exposé – plan.txt', "Draft due December 1, 2026", 'txt'],
] as [$name, $bytes, $type]) {
    check(syllabusFile($file($name, $bytes)) === [$name, $type, $bytes], "$name was not accepted as $type.");
}
$max = str_repeat('a', SYLLABUS_MAX_BYTES);
check(strlen(syllabusFile($file('max.txt', $max))[2]) === SYLLABUS_MAX_BYTES, 'A file of exactly 20 MB was rejected.');
echo "PASS 1: TXT, Markdown, PDF, DOCX, JPG, PNG, and WebP files up to exactly 20 MB are accepted\n";

// Task test 2: unsupported, empty, and oversized files get the upload window's messages.
rejects($file('syllabus.exe', 'x'), 422, 'Choose a PDF, DOCX, TXT, Markdown, or supported image file.');
rejects($file('syllabus', 'x'), 422, SYLLABUS_TYPE_ERROR);
rejects($file('empty.txt', ''), 422, 'This file is empty. Please choose another.');
rejects($file('big.txt', $max . 'a'), 422, 'Choose a file smaller than 20 MB.');
rejects(['fileName' => 'big.txt', 'content' => str_repeat('A', SYLLABUS_MAX_BASE64 + 4)], 422, SYLLABUS_SIZE_ERROR);
echo "PASS 2: an .exe, a file without a type, an empty file, and 20 MB + 1 byte are rejected\n";

// A renamed program is not a PDF or an image, and a text file can't hold NUL bytes.
foreach (['fake.pdf', 'fake.docx', 'fake.jpg', 'fake.png', 'fake.webp'] as $name) {
    rejects($file($name, "MZ\x90\x00 program"), 422, SYLLABUS_TYPE_ERROR);
}
rejects($file('binary.txt', "text\0more"), 422, SYLLABUS_TYPE_ERROR);
rejects(['fileName' => 'a.txt', 'content' => 'not base64!'], 422, 'This file could not be read. Please choose it again.');
rejects(['fileName' => 'a.txt'], 422, 'Complete all required fields.');
foreach ([null, 7, '', '   ', str_repeat('a', 252) . '.txt', "bell\u{0007}.txt", "\xFF.txt"] as $name) {
    rejects(['fileName' => $name, 'content' => 'eA=='], 422, 'Choose a file with a name of 1 to 255 characters.');
}
echo "PASS 3: mismatched first bytes, binary text, bad base64, and bad names are rejected\n";
