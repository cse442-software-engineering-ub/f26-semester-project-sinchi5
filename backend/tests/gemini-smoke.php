<?php
declare(strict_types=1);
// One real Gemini request, to check the key, the model name, and the request format after setting
// them up, or to see what the reader makes of a real syllabus. Without a file it reads a built-in
// one-page PDF (about 300 tokens; free on the free tier). Nothing else ever calls the API from a
// developer's machine, and no test runs this file.
//   NOTELY_AI_LIVE=1 NOTELY_GEMINI_API_KEY=<key> php backend/tests/gemini-smoke.php [syllabus-file] [course-year]
// Optional: NOTELY_GEMINI_MODEL=gemini-3.5-flash-lite to try another model.
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
[, $file, $year] = $argv + [null, null, 2026];
$type = $file ? strtolower(pathinfo($file, PATHINFO_EXTENSION)) : 'pdf';
try {
    $read = readSyllabusWithAi($config, liveGemini($config), $type === 'jpeg' ? 'jpg' : $type,
        $file ? file_get_contents($file) : pdfOf('Midterm exam October 14 at 10 AM; Homework 2 due Nov 3'), (int) $year);
} catch (HttpError $error) {
    fwrite(STDERR, "FAIL ({$error->status}): {$error->getMessage()} See the PHP error log line above for Google's reason.\n");
    exit(1);
}
echo json_encode($read, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";
if (!$file) {
    echo count($read['events']) === 2 ? "PASS: Gemini read both events.\n" : "CHECK: expected 2 events; the reply is above.\n";
}
