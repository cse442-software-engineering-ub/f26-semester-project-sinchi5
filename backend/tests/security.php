<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/bootstrap.php';
function check(bool $condition, string $label): void {
    if (!$condition) { throw new RuntimeException('FAIL: ' . $label); }
    echo 'PASS: ' . $label . "\n";
}
function rejects(callable $fn, string $label, int $status = 422): void {
    try { $fn(); } catch (HttpError $e) { check($e->status === $status, $label); return; }
    throw new RuntimeException('FAIL: ' . $label);
}
check(validEmail('  Jamie@Example.edu ') === 'jamie@example.edu', 'email normalization');
rejects(fn() => validEmail("victim@example.edu\r\nBcc: other@example.edu"), 'email header injection');
rejects(fn() => validEmail('not-an-email'), 'invalid email');
rejects(fn() => validName('   '), 'blank names');
check(validName('  Jamie Lee  ') === 'Jamie Lee', 'trim names');
rejects(fn() => validName(str_repeat('é', 101)), 'unicode name length');
check(validName(str_repeat('é', 100)) === str_repeat('é', 100), 'unicode name limit');
rejects(fn() => validPassword('short password'), 'short password');
rejects(fn() => validPassword(str_repeat('a', 73)), 'bcrypt truncation');
rejects(fn() => validPassword(str_repeat('é', 37)), 'unicode byte limit');
rejects(fn() => validPassword("long password\0example"), 'null bytes');
$password = validPassword('  Sample meadow password 42!  ');
check($password === '  Sample meadow password 42!  ', 'password spaces preserved');
$one = hashPassword($password); $two = hashPassword($password);
check($one !== $two && $one !== $password, 'independent random salts');
check(password_verify($password, $one), 'valid password verifies');
check(!password_verify('incorrect password', $one), 'incorrect password rejected');
$code = newRecoveryCode();
check((bool) preg_match('/^(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/D', $code), '128-bit recovery code format');
check($code !== newRecoveryCode(), 'independent recovery codes');
check(recoveryHash(strtolower(str_replace('-', ' ', $code))) === recoveryHash($code), 'recovery normalization');
check(strlen(recoveryHash($code)) === 64 && recoveryHash($code) !== $code, 'only code hash stored');
rejects(fn() => recoveryHash('0000'), 'invalid recovery code');
check(publicUser(['id' => 42, 'name' => 'Jamie', 'email' => 'jamie@example.edu', 'password_hash' => $one, 'recovery_code_hash' => recoveryHash($code)]) === ['id' => '42', 'name' => 'Jamie', 'email' => 'jamie@example.edu'], 'public user excludes secrets');

$config = ['app_key' => str_repeat('a', 64), 'cookie_path' => '/class/notely/'];
$session = ['token' => str_repeat('b', 64)];
$_SERVER['HTTP_X_CSRF_TOKEN'] = csrfToken($session, $config);
requireCsrf($session, $config);
check(true, 'matching CSRF accepted');
rejects(fn() => requireCsrf(null, $config), 'missing session rejected', 403);
rejects(fn() => requireCsrf(['token' => str_repeat('c', 64)], $config), 'other-session CSRF rejected', 403);
$_SERVER['HTTP_X_CSRF_TOKEN'] = 'forged';
rejects(fn() => requireCsrf($session, $config), 'forged CSRF rejected', 403);
check(cookieName($config) !== cookieName(['cookie_path' => '/different/']), 'cookie name isolates app paths');
