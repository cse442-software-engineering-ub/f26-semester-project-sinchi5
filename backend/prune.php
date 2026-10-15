<?php
declare(strict_types=1);
// Run periodically from CLI. Never included in the public build.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/lib/bootstrap.php';
$db = database(configuration());
$db->exec('DELETE FROM notely_sessions WHERE expires_at <= UTC_TIMESTAMP() OR last_seen_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)');
$db->exec('DELETE FROM notely_rate_limits WHERE window_start < UNIX_TIMESTAMP() - 86400');
// Uploaded syllabus files are only needed while they are reviewed (card 43).
$db->exec('UPDATE notely_import_jobs SET content = NULL WHERE content IS NOT NULL AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)');
echo "Expired account records removed.\n";
