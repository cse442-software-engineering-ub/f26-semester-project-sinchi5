<?php
// Local PHP development server only; excluded from dist.
if (parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) === '/api/index.php') {
    require __DIR__ . '/index.php';
} else {
    http_response_code(404);
}
