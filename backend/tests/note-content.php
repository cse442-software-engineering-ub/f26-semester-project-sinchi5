<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/accounts.php';
require_once __DIR__ . '/../lib/notes.php';

function check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}
function expectStatus(?PDO $db, callable $action, int $status): void
{
    try {
        $action();
    } catch (HttpError $error) {
        if ($db && $db->inTransaction()) $db->rollBack();
        check($error->status === $status, "Expected $status, got {$error->status}.");
        return;
    }
    throw new RuntimeException("Expected a $status error.");
}

// Validation can run before database configuration is available.
foreach (['', " \t\r\n Unicode \u{1F600}\u{00E9} \n", str_repeat('x', 8000)] as $body) {
    check(noteBody(['body' => $body]) === $body, 'Body validation changed content.');
}
foreach ([[], ['body' => null], ['body' => 1], ['body' => false], ['body' => []], ['body' => "\xC3\x28"]] as $input) {
    expectStatus(null, fn () => noteBody($input), 422);
}

$config = configuration();
check(in_array(parse_url($config['origin'], PHP_URL_HOST), ['localhost', '127.0.0.1', 'aptitude.cse.buffalo.edu'], true),
    'Run note content tests only on DEV or TEST.');
$db = database($config);
$users = [];
// GET note returns the whole note since card 120; these checks cover its text.
function text(array $note): array
{
    return array_intersect_key($note, ['id' => 0, 'title' => 0, 'body' => 0]);
}
function testUser(PDO $db, array $config, array &$users): array
{
    query($db, 'INSERT INTO notely_users (name, email, password_hash, recovery_code_hash) VALUES (?, ?, ?, ?)',
        ['Content Test', 'notely-content-' . bin2hex(random_bytes(8)) . '@example.edu',
            password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT), str_repeat('0', 64)]);
    $id = $db->lastInsertId();
    $users[] = $id;
    return newSession($db, $config, $id);
}
try {
    $owner = testUser($db, $config, $users);
    $other = testUser($db, $config, $users);
    $id = noteAction($db, $owner, 'note-create', ['title' => 'CSE 442 Notes'])['note']['id'];
    $_GET['id'] = $id;
    check(noteAction($db, $owner, 'note', [])['note']['body'] === '', 'Title-only creation needs an empty body.');
    query($db, 'UPDATE notely_notes SET body = ? WHERE id = ?', ['Original body', $id]);
    $before = query($db, 'SELECT id, owner_user_id, title, created_at FROM notely_notes WHERE id = ?', [$id])->fetch();
    $updated = " \tUpdated notes\r\n\u{1F600}\u{00E9} \n";
    check(noteAction($db, $owner, 'note-content', ['id' => $id, 'body' => $updated])['note']['body'] === $updated,
        'Owner update failed.');
    check(text(noteAction($db, $owner, 'note', [])['note']) === ['id' => $id, 'title' => 'CSE 442 Notes', 'body' => $updated],
        'Body did not persist exactly or title changed.');
    check(query($db, 'SELECT id, owner_user_id, title, created_at FROM notely_notes WHERE id = ?', [$id])->fetch() === $before,
        'Body update changed unrelated note fields.');
    expectStatus($db, fn () => noteAction($db, $other, 'note-content',
        ['id' => $id, 'body' => 'Intruder', 'owner_user_id' => $users[1], 'user_id' => $users[0], 'permission' => 'edit']), 403);
    expectStatus($db, fn () => noteAction($db, ['user_id' => null], 'note-content', ['id' => $id, 'body' => 'Anonymous']), 401);
    check(noteAction($db, $owner, 'note', [])['note']['body'] === $updated, 'Rejected update changed body.');
    expectStatus($db, fn () => noteAction($db, $other, 'note', []), 404);
    query($db, "INSERT INTO notely_note_editors (note_id, user_id, permission) VALUES (?, ?, 'view')", [$id, $users[1]]);
    expectStatus($db, fn () => noteAction($db, $other, 'note-content', ['id' => $id, 'body' => 'Viewer']), 403);
    check(noteAction($db, $other, 'note', [])['note']['body'] === $updated, 'Viewer rejection changed body.');
    query($db, "UPDATE notely_note_editors SET permission = 'edit' WHERE note_id = ? AND user_id = ?", [$id, $users[1]]);
    noteAction($db, $other, 'note-content', ['id' => $id, 'body' => 'Editor body', 'title' => 'Ignored title']);
    check(noteAction($db, $other, 'note', [])['note']['body'] === 'Editor body', 'Editor update did not persist.');
    check(query($db, 'SELECT permission FROM notely_note_editors WHERE note_id = ? AND user_id = ?', [$id, $users[1]])->fetchColumn() === 'edit',
        'Body update changed collaborator permission.');
    noteAction($db, $owner, 'note-title', ['id' => $id, 'title' => 'CSE 442 Notes']);
    check(noteAction($db, $owner, 'note', [])['note']['body'] === 'Editor body', 'Title update changed body.');
    expectStatus($db, fn () => noteAction($db, $owner, 'note-content', ['id' => '9999999999999999999', 'body' => 'Ghost']), 404);
    check((int) query($db, 'SELECT COUNT(*) FROM notely_notes WHERE owner_user_id = ?', [$users[0]])->fetchColumn() === 1,
        'Missing-note update created a note.');
    foreach ([[], ['body' => null], ['body' => 123], ['body' => "\xFF"]] as $input) {
        expectStatus($db, fn () => noteAction($db, $owner, 'note-content', ['id' => $id] + $input), 422);
        check(noteAction($db, $owner, 'note', [])['note']['body'] === 'Editor body', 'Invalid input changed body.');
    }
    expectStatus($db, fn () => noteAction($db, $owner, 'note-content', ['id' => '0', 'body' => 'Bad ID']), 422);
    noteAction($db, $owner, 'note-content', ['id' => $id, 'body' => '']);
    check(text(noteAction($db, $owner, 'note', [])['note']) === ['id' => $id, 'title' => 'CSE 442 Notes', 'body' => ''], 'Empty body did not persist.');
    echo "PASS: body validation, empty content, exact whitespace/Unicode, invalid UTF-8\n";
    echo "PASS: owner/editor content updates, access control, missing notes, title preservation, validation\n";
} finally {
    if ($db->inTransaction()) $db->rollBack();
    foreach ($users as $userId) query($db, 'DELETE FROM notely_users WHERE id = ?', [$userId]);
}
