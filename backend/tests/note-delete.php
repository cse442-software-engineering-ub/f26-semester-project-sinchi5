<?php
declare(strict_types=1);
// Card 116 owner-only deletion. Run only against DEV/TEST with migrations 002 and 003 applied.
require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/accounts.php';
require_once __DIR__ . '/../lib/notes.php';

function check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}
function expectStatus(PDO $db, callable $action, int $status): void
{
    try {
        $action();
    } catch (HttpError $error) {
        if ($db->inTransaction()) $db->rollBack();
        check($error->status === $status, "Expected $status, got {$error->status}.");
        return;
    }
    throw new RuntimeException("Expected a $status error.");
}

$config = configuration();
check(in_array(parse_url($config['origin'], PHP_URL_HOST), ['localhost', '127.0.0.1', 'aptitude.cse.buffalo.edu'], true),
    'Run note delete tests only on DEV or TEST.');
$db = database($config);
$users = [];
function testUser(PDO $db, array $config, array &$users): array
{
    query($db, 'INSERT INTO notely_users (name, email, password_hash, recovery_code_hash) VALUES (?, ?, ?, ?)',
        ['Delete Test', 'notely-delete-' . bin2hex(random_bytes(8)) . '@example.edu',
            password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT), str_repeat('0', 64)]);
    $id = $db->lastInsertId();
    $users[] = $id;
    return newSession($db, $config, $id);
}
function exists(PDO $db, string $id): bool
{
    return (bool) query($db, 'SELECT 1 FROM notely_notes WHERE id = ?', [$id])->fetchColumn();
}
try {
    $studentA = testUser($db, $config, $users);
    $studentB = testUser($db, $config, $users);

    // Task test 1: the owner can delete their own note.
    $owned = noteAction($db, $studentA, 'note-create', ['title' => "Owner's note"])['note']['id'];
    check(noteAction($db, $studentA, 'note-delete', ['id' => $owned]) === ['note' => ['id' => $owned]], 'Owner delete failed.');
    check(!exists($db, $owned), 'Deleted note is still stored.');
    $_GET['id'] = $owned;
    expectStatus($db, fn () => noteAction($db, $studentA, 'note', []), 404);
    expectStatus($db, fn () => noteAction($db, $studentA, 'note-delete', ['id' => $owned]), 404);

    // Task test 2: edit and view collaborators cannot delete.
    $shared = noteAction($db, $studentA, 'note-create', ['title' => 'Group project plan'])['note']['id'];
    noteAction($db, $studentA, 'note-content', ['id' => $shared, 'body' => 'Milestones']);
    query($db, "INSERT INTO notely_note_editors (note_id, user_id, permission) VALUES (?, ?, 'edit')", [$shared, $users[1]]);
    $_GET['id'] = $shared;
    $before = noteAction($db, $studentA, 'note', []);
    foreach (['edit', 'view'] as $permission) {
        query($db, 'UPDATE notely_note_editors SET permission = ? WHERE note_id = ? AND user_id = ?', [$permission, $shared, $users[1]]);
        expectStatus($db, fn () => noteAction($db, $studentB, 'note-delete', ['id' => $shared]), 403);
    }
    check(noteAction($db, $studentA, 'note', []) === $before, 'Rejected delete changed the note.');
    check(query($db, 'SELECT user_id, permission FROM notely_note_editors WHERE note_id = ?', [$shared])->fetchAll()
        === [['user_id' => (int) $users[1], 'permission' => 'view']], 'Rejected delete changed collaborators.');

    // Task test 3: signed-out and forged requests cannot delete.
    expectStatus($db, fn () => noteAction($db, ['user_id' => null], 'note-delete', ['id' => $shared]), 401);
    expectStatus($db, fn () => noteAction($db, $studentB, 'note-delete',
        ['id' => $shared, 'ownerId' => $users[0], 'owner_user_id' => $users[0], 'user_id' => $users[0]]), 403);
    check(exists($db, $shared), 'Rejected delete removed the note.');

    // Validation, and collaborator rows leave with the note.
    foreach ([[], ['id' => '0'], ['id' => 5], ['id' => 'abc']] as $input) {
        expectStatus($db, fn () => noteAction($db, $studentA, 'note-delete', $input), 422);
    }
    noteAction($db, $studentA, 'note-delete', ['id' => $shared]);
    check(!exists($db, $shared), 'Shared note was not deleted.');
    check((int) query($db, 'SELECT COUNT(*) FROM notely_note_editors WHERE note_id = ?', [$shared])->fetchColumn() === 0,
        'Collaborator rows outlived the note.');
    echo "PASS: owner delete, missing notes, collaborator/viewer/signed-out/forged rejection, validation, cascade\n";
} finally {
    if ($db->inTransaction()) $db->rollBack();
    foreach ($users as $userId) query($db, 'DELETE FROM notely_users WHERE id = ?', [$userId]);
}
