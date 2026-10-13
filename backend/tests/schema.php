<?php
declare(strict_types=1);
// Read-only test against DEV/TEST using the same private configuration as the app.
require_once __DIR__ . '/../lib/bootstrap.php';
$db = database(configuration());
$tables = [
    'notely_users' => [
        'id' => ['bigint unsigned', 'NO'], 'name' => ['varchar(100)', 'NO'],
        'email' => ['varchar(254)', 'NO'], 'password_hash' => ['varchar(255)', 'NO'],
        'recovery_code_hash' => ['char(64)', 'NO'], 'onboarding_completed' => ['tinyint', 'NO'],
        'created_at' => ['datetime', 'NO'], 'updated_at' => ['datetime', 'NO'],
    ],
    'notely_sessions' => [
        'token_hash' => ['char(64)', 'NO'], 'user_id' => ['bigint unsigned', 'YES'],
        'created_at' => ['datetime', 'NO'], 'last_seen_at' => ['datetime', 'NO'], 'expires_at' => ['datetime', 'NO'],
    ],
    'notely_rate_limits' => [
        'bucket_hash' => ['char(64)', 'NO'], 'window_start' => ['bigint unsigned', 'NO'], 'attempts' => ['int unsigned', 'NO'],
    ],
    'notely_notes' => [
        'id' => ['bigint unsigned', 'NO'], 'owner_user_id' => ['bigint unsigned', 'NO'],
        'title' => ['varchar(255)', 'NO'], 'body' => ['text', 'NO'],
        'course_id' => ['varchar(64)', 'NO'], 'lecture_date' => ['date', 'YES'], 'category' => ['varchar(20)', 'NO'],
        'visibility' => ["enum('private','shared')", 'NO'], 'tags' => ['varchar(4000)', 'NO'], 'pinned' => ['tinyint', 'NO'],
        'created_at' => ['datetime', 'NO'], 'updated_at' => ['datetime', 'NO'],
    ],
    'notely_note_editors' => [
        'note_id' => ['bigint unsigned', 'NO'], 'user_id' => ['bigint unsigned', 'NO'],
        'permission' => ["enum('view','edit')", 'NO'],
    ],
    'notely_note_versions' => [
        'id' => ['bigint unsigned', 'NO'], 'note_id' => ['bigint unsigned', 'NO'], 'title' => ['varchar(255)', 'NO'],
        'body' => ['text', 'NO'], 'author_name' => ['varchar(100)', 'NO'], 'created_at' => ['datetime', 'NO'],
    ],
    'notely_note_comments' => [
        'id' => ['bigint unsigned', 'NO'], 'note_id' => ['bigint unsigned', 'NO'], 'author_user_id' => ['bigint unsigned', 'NO'],
        'body' => ['text', 'NO'], 'created_at' => ['datetime', 'NO'],
    ],
];
foreach ($tables as $table => $columns) {
    $rows = query($db, 'SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION', [$table])->fetchAll();
    if (array_column($rows, 'COLUMN_NAME') !== array_keys($columns)) { throw new RuntimeException('Unexpected columns: ' . $table); }
    echo $table . "\n";
    foreach ($rows as $row) {
        // MySQL 8 omits integer display widths; MariaDB commonly includes them.
        $type = preg_replace('/\b(bigint|tinyint|int)\(\d+\)/', '$1', strtolower($row['COLUMN_TYPE']));
        if ([$type, $row['IS_NULLABLE']] !== $columns[$row['COLUMN_NAME']]) {
            throw new RuntimeException('Unexpected type/nullability: ' . $table . '.' . $row['COLUMN_NAME']);
        }
        echo '  ' . implode(' ', $row) . "\n";
    }
}
$index = query($db, "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notely_users' AND INDEX_NAME = 'notely_users_email' AND NON_UNIQUE = 0")->fetchColumn();
if ((int) $index !== 1) { throw new RuntimeException('Missing unique email index'); }
$fk = query($db, "SELECT DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'notely_sessions_user_fk'")->fetchColumn();
if ($fk !== 'CASCADE') { throw new RuntimeException('Missing session cascade'); }
foreach (['notely_notes_owner_fk', 'notely_note_editors_note_fk', 'notely_note_editors_user_fk',
    'notely_note_versions_note_fk', 'notely_note_comments_note_fk', 'notely_note_comments_author_fk'] as $constraint) {
    $rule = query($db, 'SELECT DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ?', [$constraint])->fetchColumn();
    if ($rule !== 'CASCADE') { throw new RuntimeException('Missing note cascade: ' . $constraint); }
}
echo "PASS: schema, unique email, and account/note cascades\n";
