<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}

// Card 143: a student shares one course's schedule, view only, with a classmate by email. The classmate sees
// the course and its events (courses.php and imports.php add them with sharedBy) and can't change them.
const SCHEDULE_SHARE_READ_ROUTES = ['schedule-shares'];
const SCHEDULE_SHARE_ROUTES = [...SCHEDULE_SHARE_READ_ROUTES, 'schedule-share', 'schedule-unshare'];
const SCHEDULE_SHARE_DAILY = 100;
const SCHEDULE_READ_ONLY = 'You do not have permission to edit this schedule.';
// Joins a share (alias s) to the owner's events (alias e) and the owner (alias o).
const SHARED_EVENT_JOIN = 'JOIN notely_events e ON e.owner_user_id = s.owner_user_id AND e.course_id = s.course_id
    JOIN notely_users o ON o.id = s.owner_user_id';

// The caller's own course, or 422: a course shared with them, another student's, or a missing one all look
// the same, so course ids can't be probed.
function ownedCourse(PDO $db, string $me, mixed $courseId): string
{
    $id = courseId($courseId, 'Choose a valid course.');
    if (!query($db, 'SELECT 1 FROM notely_courses WHERE id = ? AND owner_user_id = ?', [$id, $me])->fetchColumn()) {
        throw new HttpError(422, 'Choose a valid course.');
    }
    return $id;
}

// A classmate can view a shared course's schedule but never add to or change it.
function refuseSharedCourse(PDO $db, string $me, string $courseId): void
{
    if ($courseId !== '' && query($db, 'SELECT 1 FROM notely_schedule_shares WHERE course_id = ? AND viewer_user_id = ?',
        [$courseId, $me])->fetchColumn()) {
        throw new HttpError(403, SCHEDULE_READ_ONLY);
    }
}

function scheduleShareJson(array $row): array
{
    return ['userId' => (string) $row['id'], 'name' => $row['name'], 'email' => $row['email'], 'permission' => 'view'];
}

function scheduleShares(PDO $db, string $me, string $courseId): array
{
    $rows = query($db, 'SELECT u.id, u.name, u.email FROM notely_schedule_shares s JOIN notely_users u ON u.id = s.viewer_user_id
        WHERE s.owner_user_id = ? AND s.course_id = ? ORDER BY u.name, u.id', [$me, $courseId])->fetchAll();
    return array_map('scheduleShareJson', $rows);
}

// Courses other students shared with the caller, each with who shared it.
function sharedCourses(PDO $db, string $me): array
{
    $rows = query($db, 'SELECT c.id, c.code, c.name, c.color, c.term, c.classes_start, c.classes_end, o.id AS owner_id, o.name AS owner_name
        FROM notely_schedule_shares s JOIN notely_courses c ON c.id = s.course_id AND c.owner_user_id = s.owner_user_id
        JOIN notely_users o ON o.id = s.owner_user_id
        WHERE s.viewer_user_id = ? ORDER BY s.created_at, c.id', [$me])->fetchAll();
    return array_map(fn ($row) => courseJson($row) + ['sharedBy' => ['id' => (string) $row['owner_id'], 'name' => $row['owner_name']]], $rows);
}

// Events in the courses shared with the caller, optionally one course, each with who shared it.
function sharedEvents(PDO $db, string $me, string $courseId = ''): array
{
    $columns = implode(', ', array_map(fn ($c) => 'e.' . trim($c), explode(',', EVENT_COLUMNS)));
    $rows = query($db, "SELECT $columns, o.id AS owner_id, o.name AS owner_name FROM notely_schedule_shares s " . SHARED_EVENT_JOIN . '
        WHERE s.viewer_user_id = ?' . ($courseId === '' ? '' : ' AND s.course_id = ?') . ' ORDER BY e.event_date, e.event_time, e.id',
        $courseId === '' ? [$me] : [$me, $courseId])->fetchAll();
    return array_map(fn ($row) => eventJson($row) + ['sharedBy' => ['id' => (string) $row['owner_id'], 'name' => $row['owner_name']]], $rows);
}

function scheduleShareAction(PDO $db, array $config, array $session, string $route, array $input): array
{
    if ($route === 'schedule-shares') {
        $me = (string) requireUser($db, $session)['id'];
        return ['shares' => scheduleShares($db, $me, ownedCourse($db, $me, $_GET['courseId'] ?? null))];
    }
    if ($route === 'schedule-share') {
        // Counted before any check, like friend requests: this route reveals which emails are registered.
        rateLimit($db, $config, 'schedule-share', (string) $session['user_id'], SCHEDULE_SHARE_DAILY, 86400,
            'You’ve shared schedules with a lot of people today. Try again tomorrow.');
        $email = validEmail(field($input, 'email'));
    } else {
        rateLimit($db, $config, 'data-write', (string) $session['user_id'], 1000);
        $viewerId = recordId($input['userId'] ?? null, 'Choose a valid classmate.');
    }
    // Serialize with logout and account deletion, like the other account mutations.
    $db->beginTransaction();
    $me = (string) requireUser($db, $session, true)['id'];
    $courseId = ownedCourse($db, $me, $input['courseId'] ?? null);
    if ($route === 'schedule-unshare') {
        // Stopping a share that's already gone changes nothing, so a double click is harmless.
        query($db, 'DELETE FROM notely_schedule_shares WHERE owner_user_id = ? AND course_id = ? AND viewer_user_id = ?', [$me, $courseId, $viewerId]);
        $db->commit();
        return ['shares' => scheduleShares($db, $me, $courseId)];
    }
    $them = query($db, 'SELECT id, name, email FROM notely_users WHERE email = ?', [$email])->fetch();
    if (!$them) {
        throw new HttpError(404, 'No registered account was found for this email.');
    }
    if ((string) $them['id'] === $me) {
        throw new HttpError(422, 'You can’t share a schedule with yourself.');
    }
    try {
        query($db, 'INSERT INTO notely_schedule_shares (owner_user_id, course_id, viewer_user_id) VALUES (?, ?, ?)', [$me, $courseId, $them['id']]);
    } catch (PDOException $e) {
        // The primary key: this classmate already has this course.
        if ($e->getCode() !== '23000') throw $e;
        throw new HttpError(409, 'This schedule is already shared with that person.');
    }
    $db->commit();
    http_response_code(201);
    return ['share' => scheduleShareJson($them)];
}
