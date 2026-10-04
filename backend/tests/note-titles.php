<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/accounts.php';
require_once __DIR__ . '/../lib/notes.php';

$config = configuration();
$host = parse_url($config['origin'], PHP_URL_HOST);
if (!in_array($host, ['localhost', '127.0.0.1', 'aptitude.cse.buffalo.edu'], true)) {
    throw new RuntimeException('Run note title tests only on DEV or TEST.');
}
$db = database($config);
$users = [];
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
function testUser(PDO $db, array $config, array &$users): array
{
    $email = 'notely-title-test-' . bin2hex(random_bytes(8)) . '@example.edu';
    query($db, 'INSERT INTO notely_users (name, email, password_hash, recovery_code_hash)
        VALUES (?, ?, ?, ?)', ['Title Test', $email, password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT), str_repeat('0', 64)]);
    $id = $db->lastInsertId();
    $users[] = $id;
    return newSession($db, $config, $id);
}

try {
    $owner = testUser($db, $config, $users);
    $other = testUser($db, $config, $users);
    $created = noteAction($db, $owner, 'note-create', ['title' => 'CSE 442 Notes']);
    $id = $created['note']['id'];
    check($created['note']['title'] === 'CSE 442 Notes', 'Create did not save the original title.');

    $updated = noteAction($db, $owner, 'note-title', ['id' => $id, 'title' => 'CSE 442 Sprint Notes']);
    check($updated['note']['title'] === 'CSE 442 Sprint Notes', 'Owner update failed.');
    $_GET['id'] = $id;
    check(noteAction($db, $owner, 'note', [])['note']['title'] === 'CSE 442 Sprint Notes', 'Renamed title did not persist.');

    expectStatus($db, fn () => noteAction($db, $other, 'note-title', ['id' => $id, 'title' => 'Intruder title']), 403);
    check(noteAction($db, $owner, 'note', [])['note']['title'] === 'CSE 442 Sprint Notes', 'Unauthorized update changed the title.');
    expectStatus($db, fn () => noteAction($db, $owner, 'note-title', ['id' => '9999999999999999999', 'title' => 'Ghost']), 404);
    check((int) query($db, 'SELECT COUNT(*) FROM notely_notes WHERE owner_user_id = ?', [$users[0]])->fetchColumn() === 1,
        'Missing-note update created a note.');

    query($db, "INSERT INTO notely_note_editors (note_id, user_id, permission) VALUES (?, ?, 'view')", [$id, $users[1]]);
    expectStatus($db, fn () => noteAction($db, $other, 'note-title', ['id' => $id, 'title' => 'Viewer title']), 403);
    query($db, "UPDATE notely_note_editors SET permission = 'edit' WHERE note_id = ? AND user_id = ?", [$id, $users[1]]);
    check(noteAction($db, $other, 'note-title', ['id' => $id, 'title' => 'Editor title'])['note']['title'] === 'Editor title',
        'Authorized editor could not rename the note.');
    check(noteAction($db, $owner, 'note', [])['note']['title'] === 'Editor title', 'Editor update did not persist.');
    expectStatus($db, fn () => noteAction($db, $owner, 'note-title', ['id' => $id, 'title' => '   ']), 422);
    echo "PASS: owner/editor title updates, unauthorized and missing notes, validation\n";
} finally {
    if ($db->inTransaction()) $db->rollBack();
    foreach ($users as $userId) query($db, 'DELETE FROM notely_users WHERE id = ?', [$userId]);
}
