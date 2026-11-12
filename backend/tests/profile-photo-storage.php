<?php
declare(strict_types=1);
// Read-only companion to the HTTP suite: proves replacement and deletion at the DB layer.
require_once __DIR__ . '/../lib/bootstrap.php';
if (getenv('NOTELY_TEST_ISOLATED') !== '1' || PHP_SAPI !== 'cli'
    || !preg_match('/^[0-9]+$/D', $argv[1] ?? '')
    || !preg_match('/^notely-photo-[a-f0-9-]+@example\.edu$/D', $argv[2] ?? '')) {
    throw new RuntimeException('Use only with isolated profile-photo tests.');
}
$config = configuration();
if (!in_array(parse_url($config['origin'], PHP_URL_HOST), ['localhost', '127.0.0.1', '[::1]'], true)) {
    throw new RuntimeException('Use a local disposable DEV database.');
}
$db = database($config);
$email = query($db, 'SELECT email FROM notely_users WHERE id = ?', [$argv[1]])->fetchColumn();
if ($email !== false && $email !== $argv[2]) {
    throw new RuntimeException('Test account does not match.');
}
echo query($db, 'SELECT COUNT(*) FROM notely_profile_photos WHERE user_id = ?', [$argv[1]])->fetchColumn();
