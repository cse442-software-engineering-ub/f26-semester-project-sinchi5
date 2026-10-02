<?php
declare(strict_types=1);
// Isolate deployment files and environment variables; no database connection or real credentials.
$directory = sys_get_temp_dir() . '/notely-config-test-' . bin2hex(random_bytes(8));
mkdir($directory, 0700);
mkdir($directory . '/lib', 0700);
foreach (['bootstrap.php', 'security.php'] as $file) {
    copy(__DIR__ . '/../lib/' . $file, $directory . '/lib/' . $file);
}
$variables = ['NOTELY_CONFIG', 'NOTELY_DB_NAME', 'NOTELY_DB_USER', 'NOTELY_DB_PASSWORD',
    'NOTELY_APP_KEY', 'NOTELY_ORIGIN', 'NOTELY_COOKIE_PATH', 'NOTELY_ALLOW_LOCAL_HTTP'];
$original = [];
foreach ($variables as $name) {
    $original[$name] = getenv($name);
    putenv($name);
}
function configCheck(bool $condition, string $label): void
{
    if (!$condition) { throw new RuntimeException('FAIL: ' . $label); }
    echo 'PASS: ' . $label . "\n";
}
function configRejects(callable $fn, string $label): void
{
    try { $fn(); } catch (RuntimeException $e) { configCheck(true, $label); return; }
    configCheck(false, $label);
}
function writeConfigFixture(string $path, $value): void
{
    file_put_contents($path, '<?php return ' . var_export($value, true) . ';');
}
try {
    require $directory . '/lib/bootstrap.php';
    $fixture = [
        'db_name' => 'notely_test', 'db_user' => 'fixture-user', 'db_password' => 'fixture-password',
        'app_key' => str_repeat('a', 64), 'origin' => 'https://example.edu',
        'cookie_path' => '/notely/', 'secure_cookies' => true,
    ];
    writeConfigFixture($directory . '/private.php', $fixture);
    writeConfigFixture($directory . '/config-path.php', $directory . '/private.php');
    configCheck(configuration() === $fixture, 'private configuration loads without Apache SetEnv');

    // An explicitly configured environment must win over a stale deployment pointer.
    $override = array_replace($fixture, ['db_name' => 'notely_override']);
    writeConfigFixture($directory . '/override.php', $override);
    writeConfigFixture($directory . '/config-path.php', '/missing/private.php');
    putenv('NOTELY_CONFIG=' . $directory . '/override.php');
    configCheck(configuration() === $override, 'environment path takes precedence over deployment pointer');
    putenv('NOTELY_CONFIG=' . $directory . '/missing.php');
    configRejects(fn() => configuration(), 'missing explicit configuration fails closed');
    putenv('NOTELY_CONFIG');
    configRejects(fn() => configuration(), 'missing pointer target fails closed');

    writeConfigFixture($directory . '/config-path.php', $fixture);
    configRejects(fn() => configuration(), 'deployment pointer cannot contain credentials');
    writeConfigFixture($directory . '/config-path.php', '');
    configRejects(fn() => configuration(), 'empty pointer fails closed');
    writeConfigFixture($directory . '/config-path.php', $directory . '/private.php');
    writeConfigFixture($directory . '/private.php', array_replace($fixture, ['app_key' => 'placeholder']));
    configRejects(fn() => configuration(), 'fallback still validates the app key');

    unlink($directory . '/config-path.php');
    configRejects(fn() => configuration(), 'missing configuration fails closed');
    foreach (['db_name', 'db_user', 'db_password', 'app_key', 'origin', 'cookie_path'] as $key) {
        putenv('NOTELY_' . strtoupper($key) . '=' . $fixture[$key]);
    }
    configCheck(configuration() === $fixture, 'environment-only configuration remains supported');
} finally {
    foreach ($original as $name => $value) {
        putenv($value === false ? $name : $name . '=' . $value);
    }
    foreach (['lib/bootstrap.php', 'lib/security.php', 'config-path.php', 'private.php', 'override.php'] as $file) {
        if (is_file($directory . '/' . $file)) { unlink($directory . '/' . $file); }
    }
    rmdir($directory . '/lib');
    rmdir($directory);
}
