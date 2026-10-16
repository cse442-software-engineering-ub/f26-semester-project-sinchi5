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
function message(callable $fn): string {
    try { $fn(); } catch (HttpError $e) { return $e->getMessage(); }
    throw new RuntimeException('FAIL: expected a rejection');
}
function says(callable $fn, string $needle, string $label): void {
    check(str_contains(message($fn), $needle), $label);
}

// Email
check(validEmail('  Jamie@Example.edu ') === 'jamie@example.edu', 'email normalization');
check(validEmail("\u{00A0}jamie@example.edu\u{00A0}") === 'jamie@example.edu', 'email non-breaking edge spaces trimmed');
rejects(fn() => validEmail("victim@example.edu\r\nBcc: other@example.edu"), 'email header injection');
rejects(fn() => validEmail('not-an-email'), 'invalid email');
says(fn() => validEmail(''), 'Enter your email', 'empty email message');
says(fn() => validEmail('jamie😀@example.edu'), 'emoji', 'emoji email message');
says(fn() => validEmail('jamié@example.edu'), '"é"', 'accented email names the character');
says(fn() => validEmail('jamie lee@example.edu'), 'spaces', 'inner space email message');
says(fn() => validEmail("jamie\u{200B}@example.edu"), 'hidden character', 'zero-width email message');
says(fn() => validEmail('jamie.example.edu'), 'exactly one @', 'missing @ message');
says(fn() => validEmail('a@b@example.edu'), 'exactly one @', 'double @ message');
says(fn() => validEmail('jamie@'), 'complete email', 'incomplete email message');
says(fn() => validEmail("jamie\xC3@example.edu"), 'could not read', 'invalid UTF-8 email');

// Names
rejects(fn() => validName('   '), 'blank names');
check(validName('  Jamie Lee  ') === 'Jamie Lee', 'trim names');
check(validName("Jamie\u{00A0}\u{00A0}Lee") === 'Jamie Lee', 'unicode spaces collapse');
rejects(fn() => validName(str_repeat('é', 101)), 'unicode name length');
check(validName(str_repeat('é', 100)) === str_repeat('é', 100), 'unicode name limit');
foreach (["Zoë O'Brien-Smith", 'María José', 'J. R. R. Tolkien', 'Nguyễn Văn An', '李小龙', 'Анна', 'محمد', "D’Angelo"] as $ok) {
    check(validName($ok) !== '', "international name accepted: $ok");
}
says(fn() => validName('Jamie 😀'), 'emoji', 'emoji name');
says(fn() => validName('👍🏽'), 'emoji', 'skin-tone emoji name');
says(fn() => validName('Jamie ❤️'), 'emoji', 'heart emoji with variation selector');
says(fn() => validName("Jamie\u{202E}eiL"), 'hidden character', 'bidi override name');
says(fn() => validName("Ja\u{200B}mie"), 'hidden character', 'zero-width name');
says(fn() => validName("Jamie\tLee"), 'hidden character', 'tab in name');
says(fn() => validName('Jamie2'), 'numbers', 'digits in name');
says(fn() => validName('Jamie <script>'), '"<"', 'markup in name names the character');
says(fn() => validName('Jamie@home'), '"@"', 'symbol in name names the character');
says(fn() => validName('-Jamie'), 'start with a letter', 'leading punctuation');
says(fn() => validName("Ja\u{0301}\u{0301}\u{0301}mie"), 'accent marks', 'stacked combining marks');
check(validName('Nguyễn Thị Ngọc') !== '', 'Vietnamese double diacritics accepted');
says(fn() => validName("Jamie\xFF"), 'could not read', 'invalid UTF-8 name');
// Both checks need the intl extension's Normalizer, which aptitude's PHP doesn't have.
// Without it, validName still rejects three separate marks but can't split a precomposed letter.
if (class_exists('Normalizer')) {
    says(fn() => validName("J\u{00E1}\u{0301}\u{0301}mie"), 'accent marks', 'marks stacked on a precomposed letter');
    check(validName("Zoe\u{0308}") === 'Zoë', 'decomposed accents normalized');
}

// Passwords
rejects(fn() => validPassword('seven77'), 'short password');
says(fn() => validPassword('seven77'), 'currently has 7', 'short password states its length');
check(validPassword('eight888') === 'eight888', 'eight character password');
check(validPassword(str_repeat('a', 72)) === str_repeat('a', 72), 'seventy-two character password');
check(validPassword('P@ss w0rd!~`{}[]|\\:;"<>,.?/') !== '', 'every keyboard symbol accepted');
rejects(fn() => validPassword(str_repeat('a', 73)), 'bcrypt truncation');
says(fn() => validPassword(str_repeat('a', 73)), 'at most 72', 'long password message');
says(fn() => validPassword('ééééééé'), 'accented letters', 'short unicode password rejected for characters');
says(fn() => validPassword('correct horse 😀'), 'emoji', 'emoji password');
says(fn() => validPassword('pässwort sicher'), 'accented letters', 'accented password');
says(fn() => validPassword('пароль пароль'), 'other alphabets', 'cyrillic password');
says(fn() => validPassword("tab\tpassword"), 'hidden character', 'tab in password');
says(fn() => validPassword("zero\u{200B}width pass"), 'hidden character', 'zero-width password');
rejects(fn() => validPassword("long password\0example"), 'null bytes');
says(fn() => validPassword("bad\xFFbytes password"), 'could not read', 'invalid UTF-8 password');
check(!str_contains(message(fn() => validPassword('pässwort sicher')), 'ä'), 'password characters never echoed');
says(fn() => validPassword('password123'), 'too common', 'common password rejected');
says(fn() => validPassword('QwertyUIOP'), 'too common', 'common password check ignores case');
says(fn() => recoveryHash('ZZZZ'), '0–9 and letters A–F', 'recovery code format message');
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
