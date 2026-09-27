<?php
declare(strict_types=1);

function send_json(int $status, array $body): never
{
    http_response_code($status);
    header("Content-Type: application/json");
    echo json_encode($body);
    exit;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $configPath = __DIR__ . "/config.php";
    if (!file_exists($configPath)) {
        send_json(500, [
            "error" => "Server is not configured. Copy config.example.php to config.php and fill in real credentials.",
        ]);
    }
    $config = require $configPath;
    $dsn = "mysql:host={$config['host']};dbname={$config['database']};charset=utf8mb4";
    $pdo = new PDO($dsn, $config["username"], $config["password"], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pdo;
}

function json_input(): array
{
    $raw = file_get_contents("php://input");
    $data = json_decode($raw ?: "", true);
    return is_array($data) ? $data : [];
}
