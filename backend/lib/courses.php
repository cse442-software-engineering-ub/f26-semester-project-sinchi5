<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}

// Card 141: a student's courses are stored on the server. Needs imports.php (courseId) for the id check
// and schedule-shares.php (sharedCourses).
const COURSE_READ_ROUTES = ['courses'];
const COURSE_ROUTES = [...COURSE_READ_ROUTES, 'course-save', 'course-delete', 'workspace-clear'];
const MAX_COURSES = 50;
const COURSE_COLUMNS = 'id, code, name, color, term, classes_start, classes_end';

function courseJson(array $row): array
{
    return ['id' => $row['id'], 'code' => $row['code'], 'name' => $row['name'], 'color' => $row['color'], 'term' => $row['term']]
        + ($row['classes_start'] === null ? [] : ['classesStart' => $row['classes_start']])
        + ($row['classes_end'] === null ? [] : ['classesEnd' => $row['classes_end']]);
}

function realDate(mixed $value): bool
{
    return is_string($value) && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $value, $p) === 1
        && (int) $p[1] >= 2000 && (int) $p[1] <= 2100 && checkdate((int) $p[2], (int) $p[3], (int) $p[1]);
}

// Plain visible text of 1 to $max characters.
function visibleText(mixed $value, int $max, string $message): string
{
    if (!is_string($value) || !preg_match('//u', $value) || preg_match(INVISIBLE_PATTERN, $value)
        || trimEdges($value) === '' || characterCount(trimEdges($value)) > $max) {
        throw new HttpError(422, $message);
    }
    return trimEdges($value);
}

function courseAction(PDO $db, array $config, array $session, string $route, array $input): array
{
    if ($route === 'courses') {
        $me = (string) requireUser($db, $session)['id'];
        $rows = query($db, 'SELECT ' . COURSE_COLUMNS . ' FROM notely_courses WHERE owner_user_id = ? ORDER BY created_at, id', [$me])->fetchAll();
        // Card 143: then the courses classmates shared with this student, each with sharedBy.
        return ['courses' => [...array_map('courseJson', $rows), ...sharedCourses($db, $me)]];
    }
    // Bounds how fast one account can write to the shared database.
    rateLimit($db, $config, 'data-write', (string) $session['user_id'], 1000);
    if ($route === 'workspace-clear') {
        if (($input['confirm'] ?? null) !== 'CLEAR') {
            throw new HttpError(422, 'Type CLEAR to confirm.');
        }
        // One transaction: all of it or none. Versions, comments and collaborators go with the notes through
        // ON DELETE CASCADE. Only the caller's own rows are touched; friends and the account itself stay.
        $db->beginTransaction();
        $user = requireUser($db, $session, true);
        foreach (['notely_notes', 'notely_courses', 'notely_events', 'notely_course_note_shares', 'notely_import_jobs'] as $table) {
            query($db, "DELETE FROM $table WHERE owner_user_id = ?", [$user['id']]);
        }
        $db->commit();
        return ['cleared' => true];
    }
    if ($route === 'course-save') {
        $id = $input['id'] ?? null;
        if ($id !== null && (!is_string($id) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/D', $id))) {
            throw new HttpError(422, 'Choose a valid course.');
        }
        $code = visibleText($input['code'] ?? null, 64, 'Enter a course code of 1 to 64 visible characters.');
        $name = visibleText($input['name'] ?? null, 255, 'Enter a course name of 1 to 255 visible characters.');
        $term = visibleText($input['term'] ?? null, 64, 'Enter a term of 1 to 64 visible characters.');
        $color = $input['color'] ?? null;
        if (!is_string($color) || !preg_match('/^#[0-9A-Fa-f]{6}$/D', $color)) {
            throw new HttpError(422, 'Choose a course color.');
        }
        $start = $input['classesStart'] ?? null;
        $end = $input['classesEnd'] ?? null;
        foreach ([$start, $end] as $date) {
            if ($date !== null && !realDate($date)) throw new HttpError(422, 'Choose real class start and end dates.');
        }
        if ($start !== null && $end !== null && $end <= $start) {
            throw new HttpError(422, 'Choose a class end date after the start date.');
        }
        $db->beginTransaction();
        $user = requireUser($db, $session, true);
        $owner = $id === null ? false : query($db, 'SELECT owner_user_id FROM notely_courses WHERE id = ? FOR UPDATE', [$id])->fetchColumn();
        // Another student's course looks missing, so its existence isn't revealed.
        if ($owner !== false && (string) $owner !== (string) $user['id']) {
            throw new HttpError(404, 'This course could not be found.');
        }
        if ($owner === false) {
            $count = (int) query($db, 'SELECT COUNT(*) FROM notely_courses WHERE owner_user_id = ?', [$user['id']])->fetchColumn();
            if ($count >= MAX_COURSES) throw new HttpError(422, 'You can have at most ' . MAX_COURSES . ' courses.');
            $id ??= bin2hex(random_bytes(16));
        }
        try {
            if ($owner === false) {
                query($db, 'INSERT INTO notely_courses (id, owner_user_id, code, name, color, term, classes_start, classes_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [$id, $user['id'], $code, $name, $color, $term, $start, $end]);
            } else {
                query($db, 'UPDATE notely_courses SET code = ?, name = ?, color = ?, term = ?, classes_start = ?, classes_end = ? WHERE id = ? AND owner_user_id = ?',
                    [$code, $name, $color, $term, $start, $end, $id, $user['id']]);
            }
        } catch (PDOException $error) {
            // Only translate collisions on the owner/code/term index.
            if (($error->errorInfo[1] ?? null) === 1062
                && str_ends_with($error->errorInfo[2] ?? '', "'notely_courses_identity'")) {
                throw new HttpError(409, 'This course has already been added.');
            }
            throw $error;
        }
        $row = query($db, 'SELECT ' . COURSE_COLUMNS . ' FROM notely_courses WHERE id = ?', [$id])->fetch();
        $db->commit();
        return ['course' => courseJson($row)];
    }
    // course-delete
    $id = courseId($input['id'] ?? null, 'Choose a valid course.');
    $db->beginTransaction();
    $user = requireUser($db, $session, true);
    if (query($db, 'DELETE FROM notely_courses WHERE id = ? AND owner_user_id = ?', [$id, $user['id']])->rowCount() === 0) {
        throw new HttpError(404, 'This course could not be found.');
    }
    // Its events go; its notes keep their text and lose the course; a share of the course has nothing left to show.
    query($db, 'DELETE FROM notely_events WHERE owner_user_id = ? AND course_id = ?', [$user['id'], $id]);
    query($db, "UPDATE notely_notes SET course_id = '', updated_at = updated_at WHERE owner_user_id = ? AND course_id = ?", [$user['id'], $id]);
    query($db, 'DELETE FROM notely_course_note_shares WHERE owner_user_id = ? AND course_id = ?', [$user['id'], $id]);
    $db->commit();
    return ['deleted' => true];
}
