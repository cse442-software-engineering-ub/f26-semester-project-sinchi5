<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}

// Card 43: a syllabus upload becomes an import job that only its owner can read.
// Needs notes.php for recordId() and isoTime().
const IMPORT_READ_ROUTES = ['import-job'];
const IMPORT_ROUTES = [...IMPORT_READ_ROUTES, 'syllabus-upload'];
const SYLLABUS_MAX_BYTES = 20 * 1024 * 1024;
// A 20 MB file is 27962028 characters of base64, plus room for the JSON fields around it.
const SYLLABUS_MAX_BASE64 = 27962028;
const SYLLABUS_MAX_BODY = SYLLABUS_MAX_BASE64 + 4096;
const SYLLABUS_TYPES = ['pdf', 'docx', 'txt', 'md', 'jpg', 'png', 'webp'];
const SYLLABUS_TYPE_ERROR = 'Choose a PDF, DOCX, TXT, Markdown, or supported image file.';
const SYLLABUS_SIZE_ERROR = 'Choose a file smaller than 20 MB.';
const IMPORT_COLUMNS = 'id, kind, course_id, file_name, file_type, file_size, state, events, created_at';

// Returns [file name, type, bytes], or throws the message the upload window shows. The order and
// wording match the browser's check (src/services/repositories.ts). The contents are checked against
// the name, because a file named .pdf may be anything. The file is only ever stored as data, read as
// text, or sent to the AI reader; it is never run, written to disk, or served back to a browser.
function syllabusFile(array $input): array
{
    $name = $input['fileName'] ?? null;
    if (!is_string($name) || !preg_match('//u', $name) || preg_match(INVISIBLE_PATTERN, $name)
        || trimEdges($name) === '' || characterCount($name) > 255) {
        throw new HttpError(422, 'Choose a file with a name of 1 to 255 characters.');
    }
    $type = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $type = $type === 'jpeg' ? 'jpg' : $type;
    if (!in_array($type, SYLLABUS_TYPES, true)) {
        throw new HttpError(422, SYLLABUS_TYPE_ERROR);
    }
    $content = $input['content'] ?? null;
    if (!is_string($content)) {
        throw new HttpError(422, 'Complete all required fields.');
    }
    if (strlen($content) > SYLLABUS_MAX_BASE64) {
        throw new HttpError(422, SYLLABUS_SIZE_ERROR);
    }
    $bytes = base64_decode($content, true);
    if ($bytes === false) {
        throw new HttpError(422, 'This file could not be read. Please choose it again.');
    }
    if (strlen($bytes) > SYLLABUS_MAX_BYTES) {
        throw new HttpError(422, SYLLABUS_SIZE_ERROR);
    }
    if ($bytes === '') {
        throw new HttpError(422, 'This file is empty. Please choose another.');
    }
    $zip = $type === 'docx' ? zipDirectory($bytes) : null;
    $image = in_array($type, ['jpg', 'png', 'webp'], true) ? @getimagesizefromstring($bytes) : false;
    $matches = match ($type) {
        // A PDF starts with its header and ends with the end-of-file marker.
        'pdf' => str_contains(substr($bytes, 0, 1024), '%PDF-') && str_contains(substr($bytes, -2048), '%%EOF'),
        // A Word document is a zip that holds the document itself; one with macros is refused.
        'docx' => isset($zip['[Content_Types].xml'], $zip['word/document.xml']) && !isset($zip['word/vbaProject.bin'])
            && !($zip['word/document.xml']['flags'] & 1),
        // The image header must parse as the named format, not just start like it.
        'jpg' => ($image[2] ?? 0) === IMAGETYPE_JPEG,
        'png' => ($image[2] ?? 0) === IMAGETYPE_PNG,
        'webp' => ($image[2] ?? 0) === IMAGETYPE_WEBP,
        // Text in any encoding is fine; a NUL byte means it is really a binary file.
        default => !str_contains($bytes, "\0"),
    };
    if (!$matches) {
        throw new HttpError(422, SYLLABUS_TYPE_ERROR);
    }
    return [trimEdges($name), $type, $bytes];
}

// Lists a zip's files from its central directory as name => [flags, method, compressed, local], or
// returns null when the bytes aren't a readable zip. The class servers may lack the zip extension.
function zipDirectory(string $bytes): ?array
{
    $end = strrpos($bytes, "PK\x05\x06");
    $directory = $end === false || strlen($bytes) < $end + 22 ? false : unpack('vcount/x4/Voffset', $bytes, $end + 10);
    // A real Word document has a few dozen files; thousands means something else.
    if (!$directory || $directory['count'] > 5000) {
        return null;
    }
    $entries = [];
    $at = $directory['offset'];
    for ($i = 0; $i < $directory['count']; $i++) {
        if (substr($bytes, $at, 4) !== "PK\x01\x02" || strlen($bytes) < $at + 46) {
            return null;
        }
        $entry = unpack('vflags/vmethod/x8/Vcompressed/x4/vname/vextra/vcomment/x8/Vlocal', $bytes, $at + 8);
        $entries[substr($bytes, $at + 46, $entry['name'])] = $entry;
        $at += 46 + $entry['name'] + $entry['extra'] + $entry['comment'];
    }
    return $entries;
}

function importJson(array $row): array
{
    return [
        'id' => (string) $row['id'],
        'kind' => $row['kind'],
        'courseId' => $row['course_id'],
        'name' => $row['file_name'],
        'type' => $row['file_type'],
        'size' => (int) $row['file_size'],
        'state' => $row['state'],
        'events' => $row['events'] === null ? [] : json_decode($row['events'], true, 8, JSON_THROW_ON_ERROR),
        'createdAt' => isoTime($row['created_at']),
    ];
}

function ownedImport(PDO $db, array $user, string $id, bool $lock = false): array
{
    // Another student's upload looks missing, so its existence isn't revealed.
    $row = query($db, 'SELECT ' . IMPORT_COLUMNS . ' FROM notely_import_jobs WHERE id = ? AND owner_user_id = ?'
        . ($lock ? ' FOR UPDATE' : ''), [$id, $user['id']])->fetch();
    if (!$row) {
        throw new HttpError(404, 'This upload could not be found.');
    }
    return importJson($row);
}

function importAction(PDO $db, array $config, array $session, string $route, array $input): array
{
    $user = requireUser($db, $session);
    if ($route === 'import-job') {
        return ['job' => ownedImport($db, $user, recordId($_GET['id'] ?? null, 'Choose a valid upload.'))];
    }
    // Each upload can store up to 20 MB, so one account can't fill the shared database.
    rateLimit($db, $config, 'syllabus-upload', (string) $user['id'], 20);
    $course = $input['courseId'] ?? null;
    if (!is_string($course) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/D', $course)) {
        throw new HttpError(422, 'Choose a course for this syllabus.');
    }
    [$name, $type, $bytes] = syllabusFile($input);
    $insert = $db->prepare('INSERT INTO notely_import_jobs
        (owner_user_id, course_id, file_name, file_type, file_size, file_sha256, content) VALUES (?, ?, ?, ?, ?, ?, ?)');
    foreach ([$user['id'], $course, $name, $type, strlen($bytes), hash('sha256', $bytes)] as $i => $value) {
        $insert->bindValue($i + 1, $value);
    }
    $insert->bindValue(7, $bytes, PDO::PARAM_LOB);
    $insert->execute();
    http_response_code(201);
    return ['job' => ownedImport($db, $user, (string) $db->lastInsertId())];
}
