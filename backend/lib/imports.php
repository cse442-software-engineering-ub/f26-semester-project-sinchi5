<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}

// Card 43: a syllabus upload becomes an import job that only its owner can read.
// Card 47: the student's reviewed events from a job are saved to their schedule.
// import-extract reads a job with the Gemini API (syllabus-ai.php) when the browser's free rules can't.
// Needs notes.php for recordId() and isoTime().
const IMPORT_READ_ROUTES = ['import-job', 'events'];
const IMPORT_ROUTES = [...IMPORT_READ_ROUTES, 'syllabus-upload', 'import-confirm', 'import-extract'];
const EVENT_KINDS = ['lecture', 'assignment', 'quiz', 'exam', 'deadline', 'other'];
const MAX_IMPORTED_EVENTS = 200;
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

// Courses live in the browser, so the server only checks the ID's shape; events are always the caller's own.
function courseId(mixed $value, string $message): string
{
    if (!is_string($value) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/D', $value)) {
        throw new HttpError(422, $message);
    }
    return $value;
}

// Returns [title, kind, date, time or null] for each reviewed event, or throws the message to show.
function reviewedEvents(mixed $events): array
{
    if (!is_array($events) || !array_is_list($events) || count($events) < 1 || count($events) > MAX_IMPORTED_EVENTS) {
        throw new HttpError(422, 'Choose 1 to 200 events to add.');
    }
    return array_map(static function (mixed $event): array {
        $event = $event instanceof stdClass ? (array) $event : (is_array($event) ? $event : []);
        $title = is_string($event['title'] ?? null) && preg_match('//u', $event['title']) ? trimEdges($event['title']) : '';
        $date = is_string($event['date'] ?? null) ? $event['date'] : '';
        if ($title === '' || $date === '') {
            throw new HttpError(422, 'Give every event a title and a date.');
        }
        if (characterCount($title) > 255 || preg_match(INVISIBLE_PATTERN, $title)) {
            throw new HttpError(422, 'Keep each event title to 255 visible characters.');
        }
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $date, $parts) || (int) $parts[1] < 2000 || (int) $parts[1] > 2100
            || !checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1])) {
            throw new HttpError(422, 'Choose a real date for every event.');
        }
        $kind = $event['kind'] ?? 'other';
        if (!in_array($kind, EVENT_KINDS, true)) {
            throw new HttpError(422, 'Choose a valid event type.');
        }
        $time = $event['time'] ?? '';
        if (!is_string($time) || ($time !== '' && !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/D', $time))) {
            throw new HttpError(422, 'Use a 24-hour time like 10:00.');
        }
        return [$title, $kind, $date, $time === '' ? null : $time . ':00'];
    }, $events);
}

function eventJson(array $row): array
{
    return [
        'id' => (string) $row['id'],
        'courseId' => $row['course_id'],
        'title' => $row['title'],
        'kind' => $row['kind'],
        'date' => $row['event_date'],
        'time' => $row['event_time'] === null ? '' : substr($row['event_time'], 0, 5),
        'location' => '',
        'description' => '',
        'source' => $row['source'],
        'importJobId' => $row['import_job_id'] === null ? null : (string) $row['import_job_id'],
    ];
}

// Proposes events for a job the browser's free rules couldn't read well. Every API read is capped per
// student and for the whole app each day, and $send replaces the live API in tests so they never use it.
function extractImport(PDO $db, array $config, array $user, array $input, ?callable $send = null): array
{
    $id = recordId($input['id'] ?? null, 'Choose a valid upload.');
    $year = $input['year'] ?? (int) gmdate('Y');
    if (!is_int($year) || $year < 2000 || $year > 2100) {
        throw new HttpError(422, 'Choose a valid course year.');
    }
    $job = ownedImport($db, $user, $id);
    if (in_array($job['state'], ['review', 'completed'], true)) {
        return ['job' => $job];
    }
    // A class uploads the same syllabus many times, so a file that was read once is free after that.
    // Only this term's reads are reused: a syllabus without years reused next year needs new dates.
    $events = query($db, 'SELECT other.events FROM notely_import_jobs mine
        JOIN notely_import_jobs other ON other.file_sha256 = mine.file_sha256 AND other.events IS NOT NULL
            AND other.updated_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 180 DAY)
        WHERE mine.id = ? LIMIT 1', [$id])->fetchColumn();
    if ($events === false) {
        // Claiming the job first means a double click can't pay for two reads of one file. A claim left
        // by a request the server killed mid-read expires after 5 minutes.
        $claim = query($db, "UPDATE notely_import_jobs SET state = 'processing' WHERE id = ? AND (state IN ('queued', 'failed')
            OR (state = 'processing' AND updated_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)))", [$id]);
        if ($claim->rowCount() !== 1) {
            throw new HttpError(409, 'This file is already being read. Please wait a moment.');
        }
        try {
            $send ??= liveGemini($config);
            $perStudent = (int) ($config['ai_user_daily_limit'] ?? 5);
            rateLimit($db, $config, 'syllabus-ai', (string) $user['id'], $perStudent, 86400,
                "You can read $perStudent syllabi automatically each day. Try again tomorrow.");
            rateLimit($db, $config, 'syllabus-ai', 'everyone', (int) ($config['ai_daily_limit'] ?? 50), 86400,
                'Automatic reading has reached its limit for today. Try again tomorrow.');
            $content = query($db, 'SELECT content FROM notely_import_jobs WHERE id = ?', [$id])->fetchColumn();
            if (!is_string($content)) {
                throw new HttpError(422, 'This upload expired. Please choose the file again.');
            }
            set_time_limit(180);
            $events = json_encode(readSyllabusWithAi($config, $send, $job['type'], $content, $year),
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        } catch (Throwable $error) {
            query($db, "UPDATE notely_import_jobs SET state = 'failed' WHERE id = ?", [$id]);
            throw $error;
        }
    }
    query($db, "UPDATE notely_import_jobs SET state = 'review', events = ?, content = NULL WHERE id = ?", [$events, $id]);
    return ['job' => ownedImport($db, $user, $id)];
}

function importAction(PDO $db, array $config, array $session, string $route, array $input): array
{
    if ($route === 'import-confirm') {
        $events = reviewedEvents($input['events'] ?? null);
        // Locking the account and the job makes a repeated or concurrent confirm add nothing twice.
        $db->beginTransaction();
        $user = requireUser($db, $session, true);
        $job = ownedImport($db, $user, recordId($input['id'] ?? null, 'Choose a valid upload.'), true);
        $course = courseId($input['courseId'] ?? $job['courseId'], 'Choose a course for this syllabus.');
        $created = 0;
        if ($job['state'] !== 'completed') {
            foreach ($events as $event) {
                query($db, "INSERT INTO notely_events (owner_user_id, course_id, title, kind, event_date, event_time, source, import_job_id)
                    VALUES (?, ?, ?, ?, ?, ?, 'imported', ?)", [$user['id'], $course, ...$event, $job['id']]);
            }
            $created = count($events);
            // The file is no longer needed once its events are in the schedule.
            query($db, "UPDATE notely_import_jobs SET state = 'completed', content = NULL WHERE id = ?", [$job['id']]);
        }
        $db->commit();
        return ['created' => $created];
    }
    $user = requireUser($db, $session);
    if ($route === 'import-extract') {
        return extractImport($db, $config, $user, $input);
    }
    if ($route === 'import-job') {
        return ['job' => ownedImport($db, $user, recordId($_GET['id'] ?? null, 'Choose a valid upload.'))];
    }
    if ($route === 'events') {
        $course = $_GET['courseId'] ?? '';
        $filter = $course === '' ? '' : ' AND course_id = ?';
        $values = $course === '' ? [$user['id']] : [$user['id'], courseId($course, 'Choose a valid course.')];
        $rows = query($db, 'SELECT id, course_id, title, kind, event_date, event_time, source, import_job_id FROM notely_events
            WHERE owner_user_id = ?' . $filter . ' ORDER BY event_date, event_time, id', $values)->fetchAll();
        return ['events' => array_map('eventJson', $rows)];
    }
    // Each upload can store up to 20 MB, so one account can't fill the shared database.
    rateLimit($db, $config, 'syllabus-upload', (string) $user['id'], 20);
    $course = courseId($input['courseId'] ?? null, 'Choose a course for this syllabus.');
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
