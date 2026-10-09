<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}

// GET routes only read; every other note route writes inside one transaction.
const NOTE_READ_ROUTES = ['note', 'notes', 'note-versions', 'note-comments', 'note-collaborators'];
const NOTE_ROUTES = [...NOTE_READ_ROUTES, 'note-create', 'note-title', 'note-content', 'note-save', 'note-pin',
    'note-restore', 'note-delete', 'note-comment', 'note-invite', 'note-permission'];
const NOTE_CATEGORIES = ['School', 'Work', 'Meetings', 'Personal'];
const NOTE_COLUMNS = 'n.id, n.owner_user_id, n.title, n.body, n.course_id, n.lecture_date, n.category,
    n.visibility, n.tags, n.pinned, n.created_at, n.updated_at';

function recordId(mixed $value, string $message): string
{
    if (!is_string($value) || !preg_match('/^[1-9][0-9]{0,19}$/D', $value)
        || (strlen($value) === 20 && strcmp($value, '18446744073709551615') > 0)) {
        throw new HttpError(422, $message);
    }
    return $value;
}

function noteId(mixed $value): string
{
    return recordId($value, 'Choose a valid note.');
}

function noteTitle(array $input): string
{
    $title = field($input, 'title');
    if (!preg_match('//u', $title)) {
        throw new HttpError(422, 'The note title contains characters we could not read.');
    }
    $title = trimEdges($title);
    $length = characterCount($title);
    if ($length < 1 || $length > 255 || preg_match(INVISIBLE_PATTERN, $title)) {
        throw new HttpError(422, 'Enter a note title of 1 to 255 visible characters.');
    }
    return $title;
}

function noteBody(array $input): string
{
    $body = field($input, 'body');
    if (!preg_match('//u', $body)) {
        throw new HttpError(422, 'The note body contains characters we could not read.');
    }
    return $body;
}

// Returns [course_id, lecture_date, category, visibility, tags JSON] in column order.
function noteFields(array $input): array
{
    $course = $input['courseId'] ?? '';
    if (!is_string($course) || !preg_match('/^[A-Za-z0-9_-]{0,64}$/D', $course)) {
        throw new HttpError(422, 'Choose a valid course.');
    }
    $date = $input['lectureDate'] ?? '';
    if (!is_string($date) || ($date !== '' && (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $date, $parts)
        || !checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1])))) {
        throw new HttpError(422, 'Choose a valid lecture date.');
    }
    $category = $input['category'] ?? 'School';
    if (!in_array($category, NOTE_CATEGORIES, true)) {
        throw new HttpError(422, 'Choose a valid category.');
    }
    $visibility = $input['visibility'] ?? 'private';
    if (!in_array($visibility, ['private', 'shared'], true)) {
        throw new HttpError(422, 'Choose who can see this note.');
    }
    $tags = $input['tags'] ?? [];
    if (!is_array($tags) || array_values($tags) !== $tags || count($tags) > 30) {
        throw new HttpError(422, 'Use at most 30 tags.');
    }
    foreach ($tags as $tag) {
        if (!is_string($tag) || !preg_match('//u', $tag) || characterCount($tag) > 100) {
            throw new HttpError(422, 'Keep each tag to 100 characters of plain text.');
        }
    }
    $tags = json_encode($tags, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    if (characterCount($tags) > 4000) {
        throw new HttpError(422, 'Use at most 30 tags.');
    }
    return [$course, $date === '' ? null : $date, $category, $visibility, $tags];
}

function isoTime(string $value): string
{
    // The connection uses UTC, so stored DATETIME values are UTC.
    return str_replace(' ', 'T', $value) . 'Z';
}

function noteJson(array $row): array
{
    return [
        'id' => (string) $row['id'],
        'ownerId' => (string) $row['owner_user_id'],
        'title' => $row['title'],
        'body' => $row['body'],
        'courseId' => $row['course_id'],
        'lectureDate' => $row['lecture_date'] ?? '',
        'category' => $row['category'],
        'visibility' => $row['visibility'],
        'tags' => json_decode($row['tags'], true) ?: [],
        'pinned' => (bool) $row['pinned'],
        'createdAt' => isoTime($row['created_at']),
        'updatedAt' => isoTime($row['updated_at']),
    ];
}

function loadNote(PDO $db, string $id): array
{
    return noteJson(query($db, 'SELECT ' . NOTE_COLUMNS . ' FROM notely_notes n WHERE n.id = ?', [$id])->fetch());
}

function loadCollaborator(PDO $db, string $noteId, string $userId): ?array
{
    $row = query($db, 'SELECT u.id, u.name, u.email, e.permission FROM notely_note_editors e
        JOIN notely_users u ON u.id = e.user_id WHERE e.note_id = ? AND e.user_id = ?', [$noteId, $userId])->fetch();
    return $row ? ['id' => (string) $row['id'], 'name' => $row['name'], 'email' => $row['email'], 'permission' => $row['permission']] : null;
}

function commentJson(array $row): array
{
    return ['id' => (string) $row['id'], 'noteId' => (string) $row['note_id'], 'body' => $row['body'],
        'author' => $row['name'], 'authorId' => (string) $row['author_user_id'], 'createdAt' => isoTime($row['created_at'])];
}

// The caller's role on an existing note: 'owner', 'edit', 'view', or 'none'.
function noteRole(PDO $db, string $id, array $user, bool $lock): string
{
    $row = query($db, 'SELECT n.owner_user_id, e.permission FROM notely_notes n
        LEFT JOIN notely_note_editors e ON e.note_id = n.id AND e.user_id = ?
        WHERE n.id = ?' . ($lock ? ' FOR UPDATE' : ''), [$user['id'], $id])->fetch();
    if (!$row) throw new HttpError(404, 'This note could not be found.');
    if ((string) $row['owner_user_id'] === (string) $user['id']) return 'owner';
    return $row['permission'] ?? 'none';
}

function requireEditor(PDO $db, string $id, array $user): void
{
    if (!in_array(noteRole($db, $id, $user, true), ['owner', 'edit'], true)) {
        throw new HttpError(403, 'You do not have permission to edit this note.');
    }
}

function requireOwner(PDO $db, string $id, array $user, string $message): void
{
    // The caller always comes from the session; owner IDs sent with a request are ignored.
    if (noteRole($db, $id, $user, true) !== 'owner') throw new HttpError(403, $message);
}

function keepVersion(PDO $db, string $id, array $user, string $title, string $body): void
{
    // Like the browser repository, changing the title or body keeps the previous text as a version.
    $previous = query($db, 'SELECT title, body, updated_at FROM notely_notes WHERE id = ?', [$id])->fetch();
    if ($previous['title'] !== $title || $previous['body'] !== $body) {
        query($db, 'INSERT INTO notely_note_versions (note_id, title, body, author_name, created_at) VALUES (?, ?, ?, ?, ?)',
            [$id, $previous['title'], $previous['body'], $user['name'], $previous['updated_at']]);
    }
}

function noteAction(PDO $db, array $session, string $route, array $input, array $config = []): array
{
    $write = !in_array($route, NOTE_READ_ROUTES, true);
    // An invitation reveals whether an email is registered, so invitations are throttled per user.
    if ($route === 'note-invite' && $config) rateLimit($db, $config, 'note-invite', (string) $session['user_id'], 30);
    if ($write) $db->beginTransaction();
    $user = requireUser($db, $session, $write);
    $result = noteRoute($db, $user, $route, $input);
    if ($write) $db->commit();
    return $result;
}

function noteRoute(PDO $db, array $user, string $route, array $input): array
{
    if ($route === 'notes') {
        $rows = query($db, 'SELECT ' . NOTE_COLUMNS . ' FROM notely_notes n
            LEFT JOIN notely_note_editors e ON e.note_id = n.id AND e.user_id = ?
            WHERE n.owner_user_id = ? OR e.user_id IS NOT NULL
            ORDER BY n.updated_at DESC, n.id DESC', [$user['id'], $user['id']])->fetchAll();
        return ['notes' => array_map('noteJson', $rows)];
    }
    if ($route === 'note-create') {
        $title = noteTitle($input);
        $body = array_key_exists('body', $input) ? noteBody($input) : '';
        query($db, 'INSERT INTO notely_notes (owner_user_id, title, body, course_id, lecture_date, category, visibility, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [$user['id'], $title, $body, ...noteFields($input)]);
        $id = (string) $db->lastInsertId();
        http_response_code(201);
        return ['note' => loadNote($db, $id)];
    }

    $read = in_array($route, NOTE_READ_ROUTES, true);
    $id = noteId($read ? ($_GET['id'] ?? null) : ($input['id'] ?? null));
    if ($read) {
        // Notes the caller can't open look missing, so their existence isn't revealed.
        if (noteRole($db, $id, $user, false) === 'none') throw new HttpError(404, 'This note could not be found.');
        if ($route === 'note') return ['note' => loadNote($db, $id)];
        if ($route === 'note-versions') {
            $rows = query($db, 'SELECT id, note_id, title, body, author_name, created_at FROM notely_note_versions
                WHERE note_id = ? ORDER BY created_at DESC, id DESC', [$id])->fetchAll();
            return ['versions' => array_map(fn ($row) => ['id' => (string) $row['id'], 'noteId' => (string) $row['note_id'],
                'title' => $row['title'], 'body' => $row['body'], 'author' => $row['author_name'],
                'createdAt' => isoTime($row['created_at'])], $rows)];
        }
        if ($route === 'note-comments') {
            $rows = query($db, 'SELECT c.id, c.note_id, c.body, c.author_user_id, u.name, c.created_at FROM notely_note_comments c
                JOIN notely_users u ON u.id = c.author_user_id WHERE c.note_id = ? ORDER BY c.created_at, c.id', [$id])->fetchAll();
            return ['comments' => array_map('commentJson', $rows)];
        }
        $rows = query($db, 'SELECT e.user_id FROM notely_note_editors e JOIN notely_users u ON u.id = e.user_id
            WHERE e.note_id = ? ORDER BY u.name, u.id', [$id])->fetchAll();
        return ['collaborators' => array_map(fn ($row) => loadCollaborator($db, $id, (string) $row['user_id']), $rows)];
    }

    if ($route === 'note-title' || $route === 'note-content') {
        $value = $route === 'note-content'
            ? noteBody($input)
            : noteTitle($input);

        requireEditor($db, $id, $user);

        $current = loadNote($db, $id);

        $title = $route === 'note-title'
            ? $value
            : $current['title'];

        $body = $route === 'note-content'
            ? $value
            : $current['body'];

        keepVersion($db, $id, $user, $title, $body);

        query(
            $db,
            'UPDATE notely_notes SET '
            . ($route === 'note-content' ? 'body' : 'title')
            . ' = ? WHERE id = ?',
            [$value, $id]
        );

        return [
            'note' => [
                'id' => $id,
                $route === 'note-content' ? 'body' : 'title' => $value,
            ],
        ];
    }
    if ($route === 'note-save') {
        $title = noteTitle($input);
        $body = noteBody($input);
        requireEditor($db, $id, $user);
        // Fields left out of the request keep their current values.
        $fields = noteFields($input + loadNote($db, $id));
        keepVersion($db, $id, $user, $title, $body);
        query($db, 'UPDATE notely_notes SET title = ?, body = ?, course_id = ?, lecture_date = ?, category = ?,
            visibility = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [$title, $body, ...$fields, $id]);
        return ['note' => loadNote($db, $id)];
    }
    if ($route === 'note-pin') {
        if (!is_bool($input['pinned'] ?? null)) throw new HttpError(422, 'Choose whether to pin this note.');
        requireEditor($db, $id, $user);
        // Pinning changes list placement, not the note's edit date.
        query($db, 'UPDATE notely_notes SET pinned = ?, updated_at = updated_at WHERE id = ?', [(int) $input['pinned'], $id]);
        return ['note' => loadNote($db, $id)];
    }
    if ($route === 'note-restore') {
        $versionId = recordId($input['versionId'] ?? null, 'Choose a valid version.');
        requireEditor($db, $id, $user);
        $version = query($db, 'SELECT title, body FROM notely_note_versions WHERE id = ? AND note_id = ?', [$versionId, $id])->fetch();
        if (!$version) throw new HttpError(404, 'Version not found.');
        keepVersion($db, $id, $user, $version['title'], $version['body']);
        query($db, 'UPDATE notely_notes SET title = ?, body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [$version['title'], $version['body'], $id]);
        return ['note' => loadNote($db, $id)];
    }
    if ($route === 'note-delete') {
        requireOwner($db, $id, $user, "Only the note's owner can delete it.");
        // Collaborators, versions, and comments go with the note through ON DELETE CASCADE.
        query($db, 'DELETE FROM notely_notes WHERE id = ?', [$id]);
        return ['note' => ['id' => $id]];
    }
    if ($route === 'note-comment') {
        $raw = field($input, 'body');
        if (!preg_match('//u', $raw)) throw new HttpError(422, 'The comment contains characters we could not read.');
        $body = trimEdges($raw);
        if ($body === '') throw new HttpError(422, 'Write a comment first.');
        if (characterCount($body) > 2000) throw new HttpError(422, 'Comments can be at most 2000 characters.');
        if (noteRole($db, $id, $user, true) === 'none') throw new HttpError(404, 'This note could not be found.');
        $visibility = query($db, 'SELECT visibility FROM notely_notes WHERE id = ?', [$id])->fetchColumn();
        if ($visibility !== 'shared') throw new HttpError(422, 'Share this note before adding comments.');
        query($db, 'INSERT INTO notely_note_comments (note_id, author_user_id, body) VALUES (?, ?, ?)', [$id, $user['id'], $body]);
        $row = query($db, 'SELECT c.id, c.note_id, c.body, c.author_user_id, u.name, c.created_at FROM notely_note_comments c
            JOIN notely_users u ON u.id = c.author_user_id WHERE c.id = ?', [$db->lastInsertId()])->fetch();
        return ['comment' => commentJson($row)];
    }
    if ($route === 'note-invite') {
        $email = validEmail(field($input, 'email'));
        requireOwner($db, $id, $user, "Only the note's owner can invite collaborators.");
        $invitee = query($db, 'SELECT id FROM notely_users WHERE email = ?', [$email])->fetchColumn();
        if (!$invitee) throw new HttpError(404, 'No registered account was found for this email.');
        if ((string) $invitee === (string) $user['id']) throw new HttpError(422, 'You already own this note.');
        query($db, "INSERT INTO notely_note_editors (note_id, user_id, permission) VALUES (?, ?, 'view')
            ON DUPLICATE KEY UPDATE permission = permission", [$id, $invitee]);
        return ['collaborator' => loadCollaborator($db, $id, (string) $invitee)];
    }
    if ($route === 'note-permission') {
        $userId = recordId($input['userId'] ?? null, 'Choose a valid collaborator.');
        $permission = $input['permission'] ?? null;
        if (!in_array($permission, ['view', 'edit'], true)) throw new HttpError(422, 'Choose view or edit permission.');
        requireOwner($db, $id, $user, "Only the note's owner can change permissions.");
        if (!loadCollaborator($db, $id, $userId)) throw new HttpError(404, 'Collaborator not found.');
        query($db, 'UPDATE notely_note_editors SET permission = ? WHERE note_id = ? AND user_id = ?', [$permission, $id, $userId]);
        return ['collaborator' => loadCollaborator($db, $id, $userId)];
    }
    throw new HttpError(404, 'This action was not found.');
}
