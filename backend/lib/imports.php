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
// wording match the browser's check (imports.validate in src/services/repositories.ts); the first
// bytes are checked too, because a file named .pdf may not be a PDF.
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
    $matches = match ($type) {
        'pdf' => str_contains(substr($bytes, 0, 1024), '%PDF-'),
        'docx' => str_starts_with($bytes, "PK\x03\x04"),
        'jpg' => str_starts_with($bytes, "\xFF\xD8\xFF"),
        'png' => str_starts_with($bytes, "\x89PNG\r\n\x1A\n"),
        'webp' => str_starts_with($bytes, 'RIFF') && substr($bytes, 8, 4) === 'WEBP',
        // Text in any encoding is fine; a NUL byte means it is really a binary file.
        default => !str_contains($bytes, "\0"),
    };
    if (!$matches) {
        throw new HttpError(422, SYLLABUS_TYPE_ERROR);
    }
    return [trimEdges($name), $type, $bytes];
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
