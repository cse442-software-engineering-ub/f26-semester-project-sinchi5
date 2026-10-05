<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}

function noteId(mixed $value): string
{
    if (!is_string($value) || !preg_match('/^[1-9][0-9]{0,19}$/D', $value)
        || (strlen($value) === 20 && strcmp($value, '18446744073709551615') > 0)) {
        throw new HttpError(422, 'Choose a valid note.');
    }
    return $value;
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

function noteAction(PDO $db, array $session, string $route, array $input): array
{
    if ($route !== 'note') $db->beginTransaction();
    $user = requireUser($db, $session, $route !== 'note');
    if ($route === 'note-create') {
        $title = noteTitle($input);
        query($db, 'INSERT INTO notely_notes (owner_user_id, title, body) VALUES (?, ?, ?)', [$user['id'], $title, '']);
        $id = $db->lastInsertId();
        $db->commit();
        http_response_code(201);
        return ['note' => ['id' => $id, 'title' => $title]];
    }

    $id = noteId($route === 'note' ? ($_GET['id'] ?? null) : ($input['id'] ?? null));
    if ($route === 'note') {
        $note = query($db, 'SELECT n.id, n.title, n.body FROM notely_notes n
            LEFT JOIN notely_note_editors e ON e.note_id = n.id AND e.user_id = ?
            WHERE n.id = ? AND (n.owner_user_id = ? OR e.user_id IS NOT NULL)',
            [$user['id'], $id, $user['id']])->fetch();
        if (!$note) throw new HttpError(404, 'This note could not be found.');
        return ['note' => ['id' => (string) $note['id'], 'title' => $note['title'], 'body' => $note['body']]];
    }

    $value = $route === 'note-content' ? noteBody($input) : noteTitle($input);
    $note = query($db, 'SELECT owner_user_id FROM notely_notes WHERE id = ? FOR UPDATE', [$id])->fetch();
    if (!$note) throw new HttpError(404, 'This note could not be found.');
    if ((string) $note['owner_user_id'] !== (string) $user['id']) {
        $editor = query($db, "SELECT 1 FROM notely_note_editors WHERE note_id = ? AND user_id = ? AND permission = 'edit' FOR UPDATE",
            [$id, $user['id']])->fetchColumn();
        if (!$editor) throw new HttpError(403, 'You do not have permission to edit this note.');
    }
    if ($route === 'note-content') {
        query($db, 'UPDATE notely_notes SET body = ? WHERE id = ?', [$value, $id]);
    } else {
        query($db, 'UPDATE notely_notes SET title = ? WHERE id = ?', [$value, $id]);
    }
    $db->commit();
    return ['note' => ['id' => $id, $route === 'note-content' ? 'body' : 'title' => $value]];
}
