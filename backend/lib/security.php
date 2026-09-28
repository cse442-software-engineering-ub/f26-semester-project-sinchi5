<?php
declare(strict_types=1);

final class HttpError extends RuntimeException
{
    public int $status;
    public function __construct(int $status, string $message)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

function field(array $input, string $key): string
{
    if (!isset($input[$key]) || !is_string($input[$key])) {
        throw new HttpError(422, 'Complete all required fields.');
    }
    return $input[$key];
}

function validName(string $name): string
{
    $name = trim($name);
    if (!preg_match('//u', $name) || preg_match('/[\x00-\x1F\x7F]/u', $name)
        || preg_match_all('/./us', $name) < 1 || preg_match_all('/./us', $name) > 100) {
        throw new HttpError(422, 'Use a name between 1 and 100 characters.');
    }
    return $name;
}

function validEmail(string $email): string
{
    $email = strtolower(trim($email));
    if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)
        || preg_match('/[^\x20-\x7E]/', $email)) {
        throw new HttpError(422, 'Enter a valid email address.');
    }
    return $email;
}

function validPassword(string $password): string
{
    // Consistent with the bcrypt fallback: never silently truncate a password.
    if (!preg_match('//u', $password) || str_contains($password, "\0")
        || preg_match_all('/./us', $password) < 15 || strlen($password) > 72) {
        throw new HttpError(422, 'Use at least 15 characters and at most 72 bytes for your password.');
    }
    return $password;
}

function passwordAlgorithm(): array
{
    return defined('PASSWORD_ARGON2ID')
        ? [PASSWORD_ARGON2ID, ['memory_cost' => 19456, 'time_cost' => 2, 'threads' => 1]]
        : [PASSWORD_BCRYPT, ['cost' => 12]];
}

function hashPassword(string $password): string
{
    [$algorithm, $options] = passwordAlgorithm();
    return password_hash($password, $algorithm, $options);
}

function publicUser(array $user): array
{
    return ['id' => (string) $user['id'], 'name' => $user['name'], 'email' => $user['email']];
}

function newRecoveryCode(): string
{
    // 128 random bits, formatted for transcription. Display only on issuance.
    return implode('-', str_split(strtoupper(bin2hex(random_bytes(16))), 4));
}

function recoveryHash(string $code): string
{
    $code = strtoupper(preg_replace('/[\s-]+/', '', $code));
    if (!preg_match('/^[A-F0-9]{32}$/D', $code)) {
        throw new HttpError(422, 'Email or recovery code is incorrect.');
    }
    return hash('sha256', $code);
}
