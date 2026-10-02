<?php
declare(strict_types=1);
// Optional when Apache cannot set NOTELY_CONFIG. Copy to deployed api/config-path.php.
// Store only the absolute path here. The file containing credentials stays outside the web root.
if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}
return '/absolute/private/path/notely.php';
