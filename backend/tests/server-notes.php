<?php
declare(strict_types=1);
// Card 120 server-side notes. Run only against DEV/TEST with migrations 002, 003, and 004 applied.
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
    'Run server note tests only on DEV or TEST.');
$db = database($config);
$users = [];
$emails = [];
function testUser(PDO $db, array $config, array &$users, array &$emails, string $name): array
{
    $email = 'notely-server-' . bin2hex(random_bytes(8)) . '@example.edu';
    query($db, 'INSERT INTO notely_users (name, email, password_hash, recovery_code_hash) VALUES (?, ?, ?, ?)',
        [$name, $email, password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT), str_repeat('0', 64)]);
    $users[] = $db->lastInsertId();
    $emails[] = $email;
    return newSession($db, $config, end($users));
}
function read(PDO $db, array $session, string $route, string $id): array
{
    $_GET['id'] = $id;
    return noteAction($db, $session, $route, []);
}
function countRows(PDO $db, string $table, string $id): int
{
    return (int) query($db, "SELECT COUNT(*) FROM $table WHERE note_id = ?", [$id])->fetchColumn();
}
try {
    $a = testUser($db, $config, $users, $emails, 'Student A');
    $b = testUser($db, $config, $users, $emails, 'Student B');
    $c = testUser($db, $config, $users, $emails, 'Student C');

    // Create with metadata, then list only what each person can open.
    $note = noteAction($db, $a, 'note-create', ['title' => 'Shared study guide', 'body' => 'Chapter 1',
        'courseId' => 'cse442', 'lectureDate' => '2026-10-05', 'category' => 'School', 'visibility' => 'private', 'tags' => ['exam']])['note'];
    $id = $note['id'];
    check($note['ownerId'] === (string) $users[0] && $note['courseId'] === 'cse442' && $note['lectureDate'] === '2026-10-05'
        && $note['tags'] === ['exam'] && $note['pinned'] === false, 'Create did not store metadata.');
    $titles = fn (array $session) => array_column(noteAction($db, $session, 'notes', [])['notes'], 'title');
    check($titles($a) === ['Shared study guide'] && $titles($b) === [], 'List leaked or lost a note.');

    // Save keeps the previous text as a version; pin keeps the edit date.
    $saved = noteAction($db, $a, 'note-save', ['id' => $id, 'title' => 'Shared study guide', 'body' => 'Chapter 2',
        'courseId' => 'cse442', 'lectureDate' => '2026-10-05', 'category' => 'Work', 'visibility' => 'shared', 'tags' => []])['note'];
    check($saved['body'] === 'Chapter 2' && $saved['visibility'] === 'shared' && $saved['category'] === 'Work', 'Save failed.');
    $versions = read($db, $a, 'note-versions', $id)['versions'];
    check(count($versions) === 1 && $versions[0]['body'] === 'Chapter 1' && $versions[0]['author'] === 'Student A', 'Save kept no version.');
    $pinned = noteAction($db, $a, 'note-pin', ['id' => $id, 'pinned' => true])['note'];
    check($pinned['pinned'] === true && $pinned['updatedAt'] === $saved['updatedAt'], 'Pinning changed the edit date.');
    $restored = noteAction($db, $a, 'note-restore', ['id' => $id, 'versionId' => $versions[0]['id']])['note'];
    check($restored['body'] === 'Chapter 1' && count(read($db, $a, 'note-versions', $id)['versions']) === 2, 'Restore lost history.');

    // Sharing: only the owner invites and sets permissions; collaborators see the note.
    expectStatus($db, fn () => noteAction($db, $a, 'note-invite', ['id' => $id, 'email' => 'nobody-' . bin2hex(random_bytes(4)) . '@example.edu']), 404);
    expectStatus($db, fn () => noteAction($db, $a, 'note-invite', ['id' => $id, 'email' => $emails[0]]), 422);
    $invited = noteAction($db, $a, 'note-invite', ['id' => $id, 'email' => strtoupper($emails[1])])['collaborator'];
    check($invited === ['id' => (string) $users[1], 'name' => 'Student B', 'email' => $emails[1], 'permission' => 'view'], 'Invite failed.');
    expectStatus($db, fn () => noteAction($db, $b, 'note-invite', ['id' => $id, 'email' => $emails[2]]), 403);
    check($titles($b) === ['Shared study guide'] && read($db, $b, 'note', $id)['note']['body'] === 'Chapter 1', 'Collaborator cannot open the note.');
    expectStatus($db, fn () => noteAction($db, $b, 'note-pin', ['id' => $id, 'pinned' => false]), 403);
    expectStatus($db, fn () => noteAction($db, $b, 'note-permission', ['id' => $id, 'userId' => (string) $users[1], 'permission' => 'edit']), 403);
    noteAction($db, $a, 'note-permission', ['id' => $id, 'userId' => (string) $users[1], 'permission' => 'edit']);
    $edited = noteAction($db, $b, 'note-save', ['id' => $id, 'title' => 'Shared study guide', 'body' => 'Edited by B'])['note'];
    check($edited['body'] === 'Edited by B' && $edited['visibility'] === 'shared' && $edited['category'] === 'Work',
        'Edit collaborator could not save, or omitted fields were reset.');
    check(read($db, $a, 'note-collaborators', $id)['collaborators'][0]['permission'] === 'edit', 'Permission did not change.');
    expectStatus($db, fn () => read($db, $c, 'note', $id), 404);
    expectStatus($db, fn () => read($db, $c, 'note-comments', $id), 404);

    // Comments: shared notes only, trimmed, limited, and attributed to the session's user.
    $comment = noteAction($db, $b, 'note-comment', ['id' => $id, 'body' => "  Great guide.  ", 'authorId' => (string) $users[0]])['comment'];
    check($comment['author'] === 'Student B' && $comment['authorId'] === (string) $users[1] && $comment['body'] === 'Great guide.', 'Comment author was forged.');
    foreach ([['body' => '   '], ['body' => str_repeat('x', 2001)], ['body' => 5]] as $input) {
        expectStatus($db, fn () => noteAction($db, $a, 'note-comment', ['id' => $id] + $input), 422);
    }
    expectStatus($db, fn () => noteAction($db, $c, 'note-comment', ['id' => $id, 'body' => 'Intruder']), 404);
    check(count(read($db, $a, 'note-comments', $id)['comments']) === 1, 'Comment count is wrong.');

    // Deleting removes the note with its collaborators, history, and comments; the collaborator loses access.
    expectStatus($db, fn () => noteAction($db, $b, 'note-delete', ['id' => $id]), 403);
    noteAction($db, $a, 'note-delete', ['id' => $id]);
    foreach (['notely_note_editors', 'notely_note_versions', 'notely_note_comments'] as $table) {
        check(countRows($db, $table, $id) === 0, "Deleting left rows in $table.");
    }
    check($titles($a) === [] && $titles($b) === [], 'Deleted note is still listed.');
    expectStatus($db, fn () => read($db, $b, 'note', $id), 404);
    expectStatus($db, fn () => read($db, $b, 'note-comments', $id), 404);
    echo "PASS: metadata, listing, versions, pinning, restore, sharing, permissions, comments, delete cascade and lost access\n";
} finally {
    if ($db->inTransaction()) $db->rollBack();
    foreach ($users as $userId) query($db, 'DELETE FROM notely_users WHERE id = ?', [$userId]);
}
