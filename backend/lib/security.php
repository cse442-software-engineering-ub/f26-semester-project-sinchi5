<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}

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

// Emoji, pictographs, flags, and the joiners/selectors that build them. Used to explain rejections.
const EMOJI_PATTERN = '/[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2300}-\x{23FF}\x{2B00}-\x{2BFF}\x{FE0E}\x{FE0F}\x{200D}\x{20E3}\x{E0020}-\x{E007F}]/u';
// Control, zero-width, bidirectional-override, private-use, and unassigned characters.
const INVISIBLE_PATTERN = '/\p{C}/u';
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

function characterCount(string $value): int
{
    return preg_match_all('/./us', $value);
}

function trimEdges(string $value): string
{
    return preg_replace('/^[\s\p{Z}]+|[\s\p{Z}]+$/u', '', $value);
}

function validName(string $name): string
{
    if (!preg_match('//u', $name)) {
        throw new HttpError(422, 'Your name contains characters we could not read. Try typing it again.');
    }
    // Pasted non-breaking and other Unicode spaces become ordinary single spaces.
    $name = preg_replace('/\p{Z}+/u', ' ', trimEdges($name));
    if (class_exists('Normalizer')) {
        $name = Normalizer::normalize($name, Normalizer::FORM_C) ?: $name;
    }
    $length = characterCount($name);
    if ($length === 0) {
        throw new HttpError(422, 'Enter your name.');
    }
    if ($length > 100) {
        throw new HttpError(422, "Your name can be at most 100 characters. It currently has $length.");
    }
    if (preg_match(EMOJI_PATTERN, $name)) {
        throw new HttpError(422, 'Your name can’t include emoji. Use letters only.');
    }
    if (preg_match(INVISIBLE_PATTERN, $name)) {
        throw new HttpError(422, 'Your name contains a hidden character, such as a tab or line break. Try typing it instead of pasting.');
    }
    if (preg_match('/\p{N}/u', $name)) {
        throw new HttpError(422, 'Your name can’t include numbers.');
    }
    if (preg_match('/[^\p{L}\p{M} \'’.\-]/u', $name, $match)) {
        throw new HttpError(422, "Your name can’t include \"{$match[0]}\". Use letters, spaces, hyphens (-), apostrophes ('), and periods (.).");
    }
    if (!preg_match('/^\p{L}/u', $name)) {
        throw new HttpError(422, 'Your name must start with a letter.');
    }
    // Count marks on the fully decomposed form so a precomposed letter can't hide one.
    $decomposed = class_exists('Normalizer') ? (Normalizer::normalize($name, Normalizer::FORM_D) ?: $name) : $name;
    if (preg_match('/\p{M}{3,}/u', $decomposed)) {
        throw new HttpError(422, 'Your name has too many accent marks stacked on one letter.');
    }
    return $name;
}

function validEmail(string $email): string
{
    if (!preg_match('//u', $email)) {
        throw new HttpError(422, 'Your email address contains characters we could not read. Try typing it again.');
    }
    $email = strtolower(trimEdges($email));
    if ($email === '') {
        throw new HttpError(422, 'Enter your email address.');
    }
    if (preg_match(EMOJI_PATTERN, $email)) {
        throw new HttpError(422, 'Email addresses can’t include emoji.');
    }
    if (preg_match(INVISIBLE_PATTERN, $email)) {
        throw new HttpError(422, 'Your email address contains a hidden character, such as a tab or line break. Try typing it instead of pasting.');
    }
    if (preg_match('/[\s\p{Z}]/u', $email)) {
        throw new HttpError(422, 'Email addresses can’t contain spaces.');
    }
    if (preg_match('/[^\x21-\x7E]/u', $email, $match)) {
        throw new HttpError(422, "Email addresses can’t include \"{$match[0]}\". Use unaccented letters, numbers, and symbols such as . _ - +");
    }
    if (strlen($email) > 254) {
        throw new HttpError(422, 'Email addresses can be at most 254 characters.');
    }
    if (substr_count($email, '@') !== 1) {
        throw new HttpError(422, 'Email addresses need exactly one @, like name@university.edu.');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new HttpError(422, 'Enter a complete email address, like name@university.edu.');
    }
    return $email;
}

function validPassword(string $password): string
{
    // Messages never repeat the password's own characters back to the screen.
    if (!preg_match('//u', $password)) {
        throw new HttpError(422, 'Your password contains characters we could not read. Try typing it again.');
    }
    if (preg_match(EMOJI_PATTERN, $password)) {
        throw new HttpError(422, 'Passwords can’t include emoji. Use letters, numbers, spaces, and keyboard symbols such as ! ? # $');
    }
    if (preg_match(INVISIBLE_PATTERN, $password)) {
        throw new HttpError(422, 'Your password contains a hidden character, such as a tab or line break. Try typing it instead of pasting.');
    }
    // Printable ASCII only: the same on every keyboard, and one byte per character so bcrypt never truncates.
    if (preg_match('/[^\x20-\x7E]/', $password)) {
        throw new HttpError(422, 'Passwords can’t include accented letters or characters from other alphabets, such as é, ñ, or ß. Use A–Z, numbers, spaces, and keyboard symbols.');
    }
    $length = strlen($password);
    if ($length < PASSWORD_MIN) {
        throw new HttpError(422, 'Use at least ' . PASSWORD_MIN . " characters for your password. It currently has $length.");
    }
    if ($length > PASSWORD_MAX) {
        throw new HttpError(422, 'Use at most ' . PASSWORD_MAX . " characters for your password. It currently has $length.");
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
        // The format is public, so a specific message reveals nothing about any account.
        throw new HttpError(422, 'Recovery codes have 32 characters using only numbers 0–9 and letters A–F, like 1A2B-3C4D-….');
    }
    return hash('sha256', $code);
}
