<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}

// Card 156: a student shares all of one course's notes, read only, with friends they choose.
const SHARE_READ_ROUTES = ['shared-notes', 'course-notes-shares'];
const SHARE_ROUTES = [...SHARE_READ_ROUTES, 'course-notes-share'];
const SHARE_FRIENDS_ONLY = 'You can share notes only with friends.';

function shareCourseId(mixed $value): string
{
    if (!is_string($value) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/D', $value)) {
        throw new HttpError(422, 'Choose a valid course.');
    }
    return $value;
}

function courseShares(PDO $db, string $ownerId, string $courseId): array
{
    $rows = query($db, 'SELECT u.id, u.name, u.email FROM notely_course_note_shares s ' . SHARE_FRIEND_JOIN . '
        JOIN notely_users u ON u.id = s.friend_user_id
        WHERE s.owner_user_id = ? AND s.course_id = ? ORDER BY u.name, u.id', [$ownerId, $courseId])->fetchAll();
    return array_map(fn ($row) => ['userId' => (string) $row['id'], 'name' => $row['name'], 'email' => $row['email']], $rows);
}

function shareAction(PDO $db, array $session, string $route, array $input): array
{
    if ($route === 'shared-notes') {
        $me = (string) requireUser($db, $session)['id'];
        // Every note, now or later, in a course a friend shared with this student.
        $rows = query($db, 'SELECT ' . NOTE_COLUMNS . ', u.name AS shared_name, s.course_code FROM notely_course_note_shares s
            ' . SHARE_FRIEND_JOIN . '
            JOIN notely_notes n ON n.owner_user_id = s.owner_user_id AND n.course_id = s.course_id
            JOIN notely_users u ON u.id = s.owner_user_id
            WHERE s.friend_user_id = ? ORDER BY n.updated_at DESC, n.id DESC', [$me])->fetchAll();
        return ['notes' => array_map(fn ($row) => noteJson($row) + ['permission' => 'view',
            'sharedBy' => ['id' => (string) $row['owner_user_id'], 'name' => $row['shared_name'], 'courseCode' => $row['course_code']]], $rows)];
    }
    if ($route === 'course-notes-shares') {
        $me = (string) requireUser($db, $session)['id'];
        return ['shares' => courseShares($db, $me, shareCourseId($_GET['courseId'] ?? null))];
    }
    $courseId = shareCourseId($input['courseId'] ?? null);
    $code = $input['courseCode'] ?? null;
    if (!is_string($code) || !preg_match('//u', $code) || trimEdges($code) === '' || characterCount($code) > 64) {
        throw new HttpError(422, 'Choose a valid course.');
    }
    $friendIds = $input['friendIds'] ?? null;
    if (!is_array($friendIds) || array_values($friendIds) !== $friendIds || count($friendIds) > 200) {
        throw new HttpError(422, SHARE_FRIENDS_ONLY);
    }
    $db->beginTransaction();
    $me = (string) requireUser($db, $session, true)['id'];
    $friendIds = array_values(array_unique(array_map(fn ($id) => recordId($id, SHARE_FRIENDS_ONLY), $friendIds)));
    foreach ($friendIds as $friendId) {
        // Only accepted friends; a pending request, a stranger, or yourself is refused.
        $friend = query($db, "SELECT id FROM notely_friendships WHERE status = 'accepted' AND user_low = ? AND user_high = ?",
            [min((int) $me, (int) $friendId), max((int) $me, (int) $friendId)])->fetch();
        if (!$friend || $friendId === $me) {
            throw new HttpError(422, SHARE_FRIENDS_ONLY);
        }
    }
    // The list sent replaces the course's list, so unchecking everyone stops sharing.
    query($db, 'DELETE FROM notely_course_note_shares WHERE owner_user_id = ? AND course_id = ?', [$me, $courseId]);
    foreach ($friendIds as $friendId) {
        query($db, 'INSERT INTO notely_course_note_shares (owner_user_id, course_id, course_code, friend_user_id) VALUES (?, ?, ?, ?)',
            [$me, $courseId, trimEdges($code), $friendId]);
    }
    $db->commit();
    return ['shares' => courseShares($db, $me, $courseId)];
}
