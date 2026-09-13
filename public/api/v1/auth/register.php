<?php
declare(strict_types=1);
require __DIR__ . "/../db.php";

header("Content-Type: application/json");
if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    send_json(405, ["error" => "Use POST."]);
}

$input = json_input();
$name = trim((string) ($input["name"] ?? ""));
$email = trim((string) ($input["email"] ?? ""));
$password = (string) ($input["password"] ?? "");

if ($name === "" || $email === "" || $password === "") {
    send_json(400, ["error" => "Name, email, and password are all required."]);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    send_json(400, ["error" => "Enter a valid email address."]);
}
if (strlen($password) < 8) {
    send_json(400, ["error" => "Password must be at least 8 characters."]);
}

try {
    $pdo = db();

    $existing = $pdo->prepare("SELECT id FROM users WHERE email = :email");
    $existing->execute(["email" => $email]);
    if ($existing->fetch()) {
        send_json(409, ["error" => "An account with that email already exists."]);
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $insert = $pdo->prepare(
        "INSERT INTO users (name, email, password_hash, created_at) VALUES (:name, :email, :hash, NOW())"
    );
    $insert->execute(["name" => $name, "email" => $email, "hash" => $hash]);

    send_json(201, [
        "id" => (int) $pdo->lastInsertId(),
        "name" => $name,
        "email" => $email,
    ]);
} catch (Throwable $e) {
    send_json(500, ["error" => "Could not create the account. Try again."]);
}
