<?php
declare(strict_types=1);
// Card 153 friend requests. Run only against DEV/TEST with migration 012 applied.
require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/accounts.php';
require_once __DIR__ . '/../lib/notes.php';
require_once __DIR__ . '/../lib/friends.php';

function check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}
function fails(PDO $db, callable $action, int $status, string $message): void
{
    try {
        $action();
    } catch (HttpError $error) {
        if ($db->inTransaction()) $db->rollBack();
        check($error->status === $status && $error->getMessage() === $message,
            "Expected $status \"$message\", got {$error->status} \"{$error->getMessage()}\".");
        return;
    }
    throw new RuntimeException("Expected a $status error.");
}

// rateLimit() sends a Retry-After header; buffer output so CLI runs don't warn about headers already sent.
ob_start();
$config = configuration();
check(in_array(parse_url($config['origin'], PHP_URL_HOST), ['localhost', '127.0.0.1', 'aptitude.cse.buffalo.edu'], true),
    'Run friend tests only on DEV or TEST.');
$db = database($config);
$users = [];
function testUser(PDO $db, array $config, array &$users, string $name): array
{
    $email = 'notely-friends-' . bin2hex(random_bytes(8)) . '@example.edu';
    query($db, 'INSERT INTO notely_users (name, email, password_hash, recovery_code_hash) VALUES (?, ?, ?, ?)',
        [$name, $email, password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT), str_repeat('0', 64)]);
    $users[] = $db->lastInsertId();
    return newSession($db, $config, end($users)) + ['email' => $email];
}
function rows(PDO $db, string $id): int
{
    return (int) query($db, 'SELECT COUNT(*) FROM notely_friendships WHERE requester_id = ? OR addressee_id = ?', [$id, $id])->fetchColumn();
}
try {
    $ana = testUser($db, $config, $users, 'Friend Ana');
    $bea = testUser($db, $config, $users, 'Friend Bea');
    $cal = testUser($db, $config, $users, 'Friend Cal');

    // Deleting an account deletes its friendships on both sides, accepted and pending.
    friendAction($db, $config, $ana, 'friend-request', ['email' => $bea['email']]);
    friendAction($db, $config, $bea, 'friend-request', ['email' => $ana['email']]);
    check(count(friendAction($db, $config, $ana, 'friends', [])['friends']) === 1, 'Return request did not accept.');
    friendAction($db, $config, $cal, 'friend-request', ['email' => $ana['email']]);
    check(rows($db, $users[0]) === 2, 'Friendships were not stored.');
    query($db, 'DELETE FROM notely_users WHERE id = ?', [$users[0]]);
    check(rows($db, $users[0]) === 0, 'Friendships outlived the account.');
    check(friendAction($db, $config, $bea, 'friends', []) === ['friends' => [], 'incoming' => [], 'outgoing' => []],
        'The other side still lists the deleted account.');
    echo "PASS 1: deleting an account deletes its friendships\n";

    // 30 requests a day, counting rejected lookups, so the route can't be used to probe which emails exist.
    // Cal already sent one above.
    for ($i = 2; $i <= FRIEND_DAILY_REQUESTS; $i++) {
        fails($db, fn () => friendAction($db, $config, $cal, 'friend-request', ['email' => "nobody-$i-442@example.edu"]),
            404, 'No registered account was found for this email.');
    }
    fails($db, fn () => friendAction($db, $config, $cal, 'friend-request', ['email' => $bea['email']]),
        429, 'You’ve sent a lot of friend requests today. Try again tomorrow.');
    check(rows($db, $users[2]) === 0, 'A limited request was stored.');
    echo "PASS 2: the 31st request in a day gets 429\n";
} finally {
    foreach ($users as $id) query($db, 'DELETE FROM notely_users WHERE id = ?', [$id]);
    $buckets = array_map(fn ($id) => hash_hmac('sha256', 'friend-request:' . $id, $config['app_key']), $users);
    query($db, 'DELETE FROM notely_rate_limits WHERE bucket_hash IN (' . implode(',', array_fill(0, count($buckets), '?')) . ')', $buckets);
}
