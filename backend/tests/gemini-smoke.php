<?php
declare(strict_types=1);
// One real Gemini request, to check the key, the model name, and the request format after setting
// them up. It reads a built-in one-page PDF (about 300 tokens; free on the free tier) and prints the
// events. Nothing else ever calls the API from a developer's machine, and no test runs this file.
//   NOTELY_AI_LIVE=1 NOTELY_GEMINI_API_KEY=<key> php backend/tests/gemini-smoke.php
// Optional: NOTELY_GEMINI_MODEL=gemini-3.8-flash to try another model.
require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/notes.php';
require_once __DIR__ . '/../lib/imports.php';
require_once __DIR__ . '/../lib/syllabus-ai.php';
require_once __DIR__ . '/fixtures.php';

if (getenv('NOTELY_AI_LIVE') !== '1') {
    fwrite(STDERR, "This sends one real request to Gemini. Set NOTELY_AI_LIVE=1 to run it.\n");
    exit(1);
}
$config = ['origin' => 'https://smoke-test.invalid', 'gemini_model' => getenv('NOTELY_GEMINI_MODEL') ?: SYLLABUS_AI_MODEL];
try {
    $events = readSyllabusWithAi($config, liveGemini($config), 'pdf', pdfOf('Midterm exam October 14 at 10 AM; Homework 2 due Nov 3'), 2026);
} catch (HttpError $error) {
    fwrite(STDERR, "FAIL ({$error->status}): {$error->getMessage()} See the PHP error log line above for Google's reason.\n");
    exit(1);
}
echo json_encode($events, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), "\n";
echo count($events) === 2 ? "PASS: Gemini read both events.\n" : "CHECK: expected 2 events; the reply is above.\n";
