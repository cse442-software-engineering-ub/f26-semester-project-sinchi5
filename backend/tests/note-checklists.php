<?php
declare(strict_types=1);
// Task #79 / Story #19 validation tests need no database.
require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/notes.php';
function check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}
$items = [['text' => 'Task A', 'done' => true], ['text' => 'Task B', 'done' => false]];
check(json_decode(noteChecklist($items), true) === $items, 'Order or completion states changed.');
$items = [['text' => 'Task B', 'done' => false], ['text' => 'Task C', 'done' => false]];
check(json_decode(noteChecklist([...$items, ['text' => " \t\n\u{00A0}", 'done' => false]]), true) === $items, 'Blank task retained.');
check(noteChecklist([]) === '[]', 'Empty checklist is not an array.');
check(json_decode(noteChecklist(json_decode('[{"text":"  Keep spaces  ","done":true}]')), true)
    === [['text' => '  Keep spaces  ', 'done' => true]], 'HTTP object or text preservation failed.');
foreach ([null, false, '[]', new stdClass(), [1 => $items[0]], [null], [[]],
    [['text' => 3, 'done' => false]], [['text' => 'A', 'done' => 1]], [['text' => 'A', 'done' => 'false']],
    [['text' => 'A']], [['text' => "\xff", 'done' => false]]] as $invalid) {
    try {
        noteChecklist($invalid);
    } catch (HttpError $error) {
        check($error->status === 422, 'Wrong validation status.');
        continue;
    }
    throw new RuntimeException('Malformed checklist accepted.');
}
echo "PASS: checklist validation, order, booleans, Unicode blanks, empty array, HTTP objects, exact text\n";
