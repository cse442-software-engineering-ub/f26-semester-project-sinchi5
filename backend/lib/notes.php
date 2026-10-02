<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}

require_once __DIR__ . '/accounts.php';

function publicNote(array $note): array
{
    return [
        'id' => (string) $note['id'],
        'ownerId' => (string) $note['owner_id'],
        'title' => $note['title'],
        'body' => $note['body'],
        'createdAt' => $note['created_at'],
        'updatedAt' => $note['updated_at'],
    ];
}

function noteAction(
    PDO $db,
    array $session,
    string $route,
    array $input
): array {
    $user = requireUser($db, $session);

    if ($route === 'create-note') {
        $title = trimEdges(field($input, 'title'));
        $body = field($input, 'body');

        if (!preg_match('//u', $title) || !preg_match('//u', $body)) {
            throw new HttpError(
                422,
                'The note contains characters we could not read.'
            );
        }

        if ($title === '') {
            $title = 'Untitled note';
        }

        if (characterCount($title) > 200) {
            throw new HttpError(
                422,
                'Note titles can be at most 200 characters.'
            );
        }

        query(
            $db,
            'INSERT INTO notely_notes (owner_id, title, body)
             VALUES (?, ?, ?)',
            [
                $user['id'],
                $title,
                $body,
            ]
        );

        $note = query(
            $db,
            'SELECT *
             FROM notely_notes
             WHERE id = ? AND owner_id = ?',
            [
                $db->lastInsertId(),
                $user['id'],
            ]
        )->fetch();

        http_response_code(201);

        return [
            'note' => publicNote($note),
        ];
    }

    if ($route === 'notes') {
        $notes = query(
            $db,
            'SELECT *
             FROM notely_notes
             WHERE owner_id = ?
             ORDER BY created_at DESC, id DESC',
            [$user['id']]
        )->fetchAll();

        return [
            'notes' => array_map('publicNote', $notes),
        ];
    }

    throw new HttpError(404, 'This note action was not found.');
}