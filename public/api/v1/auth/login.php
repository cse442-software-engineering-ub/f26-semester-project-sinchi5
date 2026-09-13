<?php
declare(strict_types=1);
require __DIR__ . "/../db.php";

header("Content-Type: application/json");
if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    send_json(405, ["error" => "Use POST."]);
}

$input = json_input();
$email = trim((string) ($input["email"] ?? ""));
$password = (string) ($input["password"] ?? "");

if ($email === "" || $password === "") {
    send_json(400, ["error" => "Email and password are both required."]);
}

try {
    $pdo = db();
    $stmt = $pdo->prepare(
        "SELECT id, name, email, password_hash, created_at FROM users WHERE email = :email"
    );
    $stmt->execute(["email" => $email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user["password_hash"])) {
        send_json(401, ["error" => "Those credentials don't match an account."]);
    }

    send_json(200, [
        "id" => (int) $user["id"],
        "name" => $user["name"],
        "email" => $user["email"],
        "createdAt" => $user["created_at"],
    ]);
} catch (Throwable $e) {
    send_json(500, ["error" => "Could not check that account. Try again."]);
}
