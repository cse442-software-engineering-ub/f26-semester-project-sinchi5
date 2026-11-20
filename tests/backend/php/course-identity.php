<?php
declare(strict_types=1);
// Uses a connection-local temporary table on the disposable test database.
require_once __DIR__ . '/../../../backend/lib/bootstrap.php';
if (getenv('NOTELY_TEST_ISOLATED') !== '1') throw new RuntimeException('Use a disposable local database.');
$db = database(configuration());
$db->exec('CREATE TEMPORARY TABLE notely_courses (
    id INT PRIMARY KEY, owner_user_id BIGINT UNSIGNED NOT NULL, code VARCHAR(64) NOT NULL, term VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
$db->exec("INSERT INTO notely_courses VALUES (1, 10, 'QA442', 'Fall'),
    (2, 10, '\u{2003}qa442 ', ' FALL\u{00a0}'), (3, 11, 'QA442', 'Fall')");
$script = file_get_contents(__DIR__ . '/../../../backend/migrations/023_course_identity.sql');
[$audit, $alter] = explode(';', preg_replace('/^--.*$/m', '', $script), 2);
$before = $db->query('SELECT * FROM notely_courses ORDER BY id')->fetchAll();
$groups = $db->query($audit)->fetchAll();
if (count($groups) !== 1 || (int) $groups[0]['course_count'] !== 2
    || $groups[0]['code_key'] !== 'qa442' || $groups[0]['term_key'] !== 'fall') {
    throw new RuntimeException('Legacy duplicate group missing from audit.');
}
try {
    $db->exec($alter);
    throw new RuntimeException('Migration accepted legacy duplicates.');
} catch (PDOException $error) {
    if ($error->errorInfo[1] !== 1062) throw $error;
}
if ($db->query('SELECT * FROM notely_courses ORDER BY id')->fetchAll() !== $before) {
    throw new RuntimeException('Failed migration changed the legacy rows.');
}
echo "PASS: migration detects historical duplicates and fails with both rows intact\n";
