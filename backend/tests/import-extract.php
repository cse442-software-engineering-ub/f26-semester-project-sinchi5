<?php
declare(strict_types=1);
// import-extract's spending guards with a fake Gemini API, so no request leaves the machine.
// Run only against DEV/TEST with migrations 001-006 applied: php backend/tests/import-extract.php
ini_set('error_log', '/dev/null');
// The rate limiter sends a Retry-After header, which PHP can only do before any output.
ob_start();
require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/accounts.php';
require_once __DIR__ . '/../lib/notes.php';
require_once __DIR__ . '/../lib/imports.php';
require_once __DIR__ . '/../lib/syllabus-ai.php';
require_once __DIR__ . '/fixtures.php';

function check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}
function fails(callable $action, int $status, string $message): void
{
    try {
        $action();
    } catch (HttpError $error) {
        check($error->status === $status && $error->getMessage() === $message,
            "Expected $status \"$message\", got {$error->status} \"{$error->getMessage()}\".");
        return;
    }
    throw new RuntimeException("Expected \"$message\".");
}

$config = configuration();
check(in_array(parse_url($config['origin'], PHP_URL_HOST), ['localhost', '127.0.0.1', 'aptitude.cse.buffalo.edu'], true),
    'Run import-extract tests only on DEV or TEST.');
$db = database($config);
// Each check gets daily counters of its own (a throwaway key), apart from real students' counters.
$keys = [];
$limits = function (array $limits) use (&$keys, $config): array {
    $keys[] = bin2hex(random_bytes(32));
    return ['app_key' => end($keys)] + $limits + $config;
};
$users = [];
function student(PDO $db, array &$users): array
{
    query($db, 'INSERT INTO notely_users (name, email, password_hash, recovery_code_hash) VALUES (?, ?, ?, ?)',
        ['Extract Student', 'notely-extract-' . bin2hex(random_bytes(8)) . '@example.edu',
            password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT), str_repeat('0', 64)]);
    $users[] = $db->lastInsertId();
    return ['id' => end($users)];
}
function job(PDO $db, array $user, string $bytes): string
{
    $insert = $db->prepare('INSERT INTO notely_import_jobs (owner_user_id, course_id, file_name, file_type, file_size, file_sha256, content)
        VALUES (?, ?, ?, ?, ?, ?, ?)');
    $insert->execute([$user['id'], 'cse442', 'syllabus.pdf', 'pdf', strlen($bytes), hash('sha256', $bytes), $bytes]);
    return (string) $db->lastInsertId();
}
// A fake Gemini API that counts its requests; each read answers with one event.
$requests = 0;
$gemini = function (string $path) use (&$requests): array {
    $requests++;
    return str_ends_with($path, ':countTokens') ? [200, ['totalTokens' => 900]] : [200, ['candidates' => [['finishReason' => 'STOP',
        'content' => ['parts' => [['text' => '{"events":[{"title":"Midterm exam","kind":"exam","date":"2026-10-14","time":"10:00","source":"Midterm exam October 14"}]}']]]]]]];
};
$broken = function () use (&$requests): array {
    $requests++;
    return [500, ['error' => ['message' => 'Internal error']]];
};
$state = fn (string $id) => query($db, 'SELECT state, content IS NULL AS cleared FROM notely_import_jobs WHERE id = ?', [$id])->fetch();
$read = fn (array $settings, array $user, string $id, ?callable $send = null, mixed $year = 2026)
    => extractImport($db, $settings, $user, ['id' => $id, 'year' => $year], $send ?? $gemini);
$midterm = [['title' => 'Midterm exam', 'kind' => 'exam', 'date' => '2026-10-14', 'time' => '10:00', 'source' => 'Midterm exam October 14']];

try {
    // Task test 4: an identical file is read once, a finished job isn't read again, and only one
    // request can read a job at a time.
    $roomy = $limits(['ai_user_daily_limit' => 100, 'ai_daily_limit' => 100]);
    [$a, $b] = [student($db, $users), student($db, $users)];
    $pdf = pdfOf('Midterm exam October 14 ' . bin2hex(random_bytes(8)));
    $first = job($db, $a, $pdf);
    check($read($roomy, $a, $first)['job']['events'] === $midterm && $requests === 2, 'A new file should be counted, then read once.');
    check($state($first) === ['state' => 'review', 'cleared' => 1], 'A read job should wait for review with its file dropped.');
    $read($roomy, $a, $first);
    $copy = job($db, $b, $pdf);
    check($read($roomy, $b, $copy)['job']['events'] === $midterm, 'Another student\'s identical file should get the same events.');
    check($requests === 2, 'A finished job or an identical file must not reach the API again.');
    $busy = job($db, $a, pdfOf('Quiz 1 September 8 ' . bin2hex(random_bytes(8))));
    query($db, "UPDATE notely_import_jobs SET state = 'processing' WHERE id = ?", [$busy]);
    fails(fn () => $read($roomy, $a, $busy), 409, 'This file is already being read. Please wait a moment.');
    check($requests === 2, 'A job being read must not be read twice.');
    // A request the server killed mid-read leaves a claim that expires after 5 minutes.
    query($db, 'UPDATE notely_import_jobs SET updated_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 MINUTE) WHERE id = ?', [$busy]);
    $read($roomy, $a, $busy);
    check($requests === 4 && $state($busy)['state'] === 'review', 'A stale claim should be read again.');
    // A read from last term is not reused: dates without years would be a year off.
    query($db, 'UPDATE notely_import_jobs SET updated_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 181 DAY) WHERE id IN (?, ?)', [$first, $copy]);
    $read($roomy, $b, job($db, $b, $pdf));
    check($requests === 6, 'A read older than 180 days should not be reused.');
    echo "PASS 1: an identical file is read once, finished and busy jobs aren't read again, and old reads expire\n";

    // Task test 5: each student, and the whole app, gets a fixed number of reads a day (2 and 3 here).
    $tight = $limits(['ai_user_daily_limit' => 2, 'ai_daily_limit' => 3]);
    [$c, $d] = [student($db, $users), student($db, $users)];
    $new = fn (array $user) => job($db, $user, pdfOf('Quiz ' . bin2hex(random_bytes(8))));
    $read($tight, $c, $new($c));
    $read($tight, $c, $new($c));
    $before = $requests;
    $third = $new($c);
    fails(fn () => $read($tight, $c, $third), 429, 'You can read 2 syllabi automatically each day. Try again tomorrow.');
    check($requests === $before && $state($third) === ['state' => 'failed', 'cleared' => 0],
        'A read over the student limit must not reach the API, and the job can be retried tomorrow.');
    $read($tight, $d, $new($d));
    fails(fn () => $read($tight, $d, $new($d)), 429, 'Automatic reading has reached its limit for today. Try again tomorrow.');
    check($requests === $before + 2, 'A read over the app limit must not reach the API.');
    echo "PASS 2: reads past the per-student or whole-app daily limit get 429 and never reach the API\n";

    // Task test 6: a failed read leaves the job ready to retry with its file, and nothing half-saved.
    $usual = $limits([]);
    $e = student($db, $users);
    $retry = job($db, $e, pdfOf('Lab 2 ' . bin2hex(random_bytes(8))));
    fails(fn () => $read($usual, $e, $retry, $broken), 503, SYLLABUS_AI_UNAVAILABLE);
    check($state($retry) === ['state' => 'failed', 'cleared' => 0]
        && query($db, 'SELECT events FROM notely_import_jobs WHERE id = ?', [$retry])->fetchColumn() === null,
        'A failed read should keep the file and save no events.');
    check($read($usual, $e, $retry)['job']['state'] === 'review', 'A failed job should read on retry.');
    fails(fn () => $read($usual, $a, $retry), 404, 'This upload could not be found.');
    foreach (['2026', 1999, 2101] as $year) {
        fails(fn () => $read($usual, $e, $retry, null, $year), 422, 'Choose a valid course year.');
    }
    echo "PASS 3: a failed read can be retried with its file, and other students' jobs and bad years are refused\n";
} finally {
    // Deleting each test student also deletes their jobs (ON DELETE CASCADE); the throwaway counters
    // are found by their keys.
    foreach ($users as $id) {
        query($db, 'DELETE FROM notely_users WHERE id = ?', [$id]);
    }
    foreach ($keys as $key) {
        foreach (['everyone', ...$users] as $value) {
            query($db, 'DELETE FROM notely_rate_limits WHERE bucket_hash = ?', [hash_hmac('sha256', "syllabus-ai:$value", $key)]);
        }
    }
}
