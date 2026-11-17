<?php
declare(strict_types=1);
// Card 240: the note HTML cleaner (the XSS wall) and the old-text conversion. No database needed.
require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/notes.php';

function check(bool $condition, string $label): void
{
    if (!$condition) throw new RuntimeException('FAIL: ' . $label);
}
function same(string $got, string $want, string $label): void
{
    check($got === $want, "$label\n  want: $want\n  got:  $got");
}
function status(callable $fn): int
{
    try { $fn(); } catch (HttpError $e) { return $e->status; }
    return 0;
}
// Re-reads cleaned output and names anything outside the allow-list.
function unsafe(string $html): string
{
    $doc = new DOMDocument();
    libxml_use_internal_errors(true);
    $doc->loadHTML('<meta http-equiv="Content-Type" content="text/html; charset=utf-8"><body>' . $html . '</body>');
    libxml_clear_errors();
    foreach ($doc->getElementsByTagName('body')->item(0)?->getElementsByTagName('*') ?? [] as $el) {
        if (!in_array($el->nodeName, NOTE_HTML_TAGS, true)) return "tag $el->nodeName";
        foreach ($el->attributes as $a) {
            if ($a->name === 'href' && !preg_match('~^(https?://|mailto:)\S*$~i', $a->value)) return "href $a->value";
            if ($a->name === 'style' && preg_match('/url|expression|javascript|\\\\|[<>{}]/i', $a->value)) return "style $a->value";
            if (!in_array($a->name, ['href', 'style', 'data-type', 'data-checked', 'data-color'], true)) return "attribute $a->name";
        }
    }
    return preg_match('/on\w+\s*=|<script|javascript:|vbscript:|data:/i', $html) ? 'dangerous text in markup' : '';
}

$payloads = [
    '<script>alert(1)</script><p>Hi</p>',
    '<img src=x onerror=alert(1)>',
    '<p onclick="alert(1)" onmouseover=alert(1)>Hi</p>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<a href="  javascript:alert(1)">x</a>',
    '<a href="java&#x09;script:alert(1)">x</a>',
    '<a href="&#106;&#97;vascript:alert(1)">x</a>',
    "<a href=\"java\nscript:alert(1)\">x</a>",
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    '<a href="vbscript:msgbox(1)">x</a>',
    '<a href="//evil.example/">x</a>',
    '<a href="https://ok.example/&#10;javascript:alert(1)">x</a>',
    '<span style="background-image:url(javascript:alert(1))">x</span>',
    '<span style="color: expression(alert(1))">x</span>',
    '<span style="color: #fff;}</style><script>alert(1)</script>">x</span>',
    '<span style="color: red; position: fixed; top: 0; font-family: x;background:url(//evil.example)">x</span>',
    '<span style="font-size: 18px/**/; color: rgb(0,0,0) url(x); color: #12345; color: \\23 fff">x</span>',
    '<svg onload=alert(1)><circle/></svg>after',
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<object data="javascript:alert(1)"></object><embed src="x">',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
    '<form action="javascript:alert(1)"><button formaction="javascript:alert(1)">x</button></form>',
    '<p class="x" id="y" title="t" data-foo="1" contenteditable="true">x</p>',
    '<mark data-color="red;background:url(x)" data-checked="javascript:alert(1)" data-type="evil">x</mark>',
    '<style>body{display:none}</style><!-- <script>alert(1)</script> -->x',
    '<base href="javascript:alert(1)//"><link rel=stylesheet href=x><meta http-equiv=refresh content="0;url=javascript:alert(1)">',
    '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    '<a href="https://ok.example/" onclick="alert(1)" target="_blank">ok</a>',
    "<p>a\0<script>alert(1)</script></p>",
    str_repeat('<span style="color: #000">', 300) . 'deep<script>alert(1)</script>' . str_repeat('</span>', 300),
];
foreach ($payloads as $i => $payload) {
    $clean = cleanNoteHtml($payload);
    same(unsafe($clean), '', "payload $i is inert: $payload");
    same(cleanNoteHtml($clean), $clean, "payload $i cleans to a fixed point");
}
echo 'PASS: ', count($payloads), " XSS payloads cleaned to inert, stable HTML\n";

foreach ([
    ['<p onclick="alert(1)">Hi</p>', '<p>Hi</p>'],
    ['<script>alert(1)</script><p>Hi</p>', '<p>Hi</p>'],
    ['<p><a href="javascript:alert(1)">x</a></p>', '<p><a>x</a></p>'],
    ['<p><a href="https://ok.example/" onclick="alert(1)" target="_blank">ok</a></p>', '<p><a href="https://ok.example/">ok</a></p>'],
    ['<p><span style="color: #123456; position: fixed; background-image: url(x)">x</span></p>', '<p><span style="color: #123456">x</span></p>'],
    ['<p><b>bold</b> <font color=red>and</font> <abbr>font</abbr></p>', '<p>bold and font</p>'],
    ["<p><span style=\"font-family: 'Times New Roman',Times,  serif\">t</span></p>", '<p><span style="font-family: &quot;Times New Roman&quot;, Times, serif">t</span></p>'],
    ['<p><span style="font-family: Comic Sans MS; font-size: 13px">t</span></p>', '<p>t</p>'],
    ['<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>x</p></div></li>',
        '<li data-type="taskItem" data-checked="true"><p>x</p></li>'],
    ['<p data-type="taskList">x</p>', '<p>x</p>'],
] as [$input, $want]) {
    same(cleanNoteHtml($input), $want, "exact: $input");
}
echo "PASS: handlers, bad links, and bad styles go; text and safe parts stay\n";

$rich = '<h1>Title</h1><h2 style="text-align: center">Sub</h2><h3>Small</h3>'
    . '<p style="text-align: justify"><strong>bold</strong> <em>it</em> <u>under</u> <s>strike</s> <code>code</code> '
    . '<mark data-color="#f6d85e" style="background-color: #f6d85e">hl</mark> <mark data-color="green">old hl</mark> '
    . '<span style="color: rgb(255, 0, 0); font-family: Georgia, serif; font-size: 18px">styled</span> '
    . '<span style="font-family: &quot;Times New Roman&quot;, Times, serif; background-color: rgba(0, 0, 0, 0.5)">times</span> '
    . '<a href="https://example.com/a?b=1&amp;c=2">link</a> <a href="mailto:a@example.edu">mail</a><br>line</p>'
    . '<ul><li><p>one</p></li></ul><ol><li><p>two</p></li></ol>'
    . '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>done</p></li><li data-type="taskItem" data-checked="false"><p>todo</p></li></ul>'
    . '<blockquote><p>quote</p></blockquote><pre><code>let x = 1 &lt; 2 &amp;&amp; y;</code></pre><hr><p>It\'s "quoted" — café 🎉</p>';
same(cleanNoteHtml($rich), $rich, 'allowed formatting round-trips unchanged');
foreach (NOTE_FONTS as $font) same(cleanNoteStyle("font-family: $font"), "font-family: $font", "font $font is kept");
foreach (NOTE_FONT_SIZES as $size) same(cleanNoteStyle("font-size: $size"), "font-size: $size", "size $size is kept");
echo "PASS: every allowed tag, attribute, font, and size round-trips unchanged\n";

same(notePlain('<h1>Exam</h1><p>Bring <strong>pen</strong>cil &amp; <em>eraser</em><br>now</p><ul><li><p>one</p></li></ul>'),
    'Exam Bring pencil & eraser now one', 'plain text joins blocks with spaces and decodes entities');
$body = "Exam day \u{1F389} bring a calculator\r\nand a ruler";
$start = 20; // UTF-16 units: the emoji counts 2
same(legacyNoteHtml($body, [['start' => 0, 'end' => 4, 'color' => 'pink'], ['start' => $start, 'end' => 100, 'color' => 'yellow']],
    [['text' => '<b>Return</b>', 'done' => false]]),
    '<p><mark data-color="pink">Exam</mark> day 🎉 bring a <mark data-color="yellow">calculator</mark></p>'
    . '<p><mark data-color="yellow">and a ruler</mark></p><ul data-type="taskList"><li data-type="taskItem" data-checked="false">'
    . '<p>&lt;b&gt;Return&lt;/b&gt;</p></li></ul>', 'old text: emoji, line break, out-of-range end, checklist');
same(legacyNoteHtml("a < b\n\n<i>", [], []), '<p>a &lt; b</p><p></p><p>&lt;i&gt;</p>', 'old text is escaped, never parsed');
same(legacyNoteHtml('', [], []), '', 'an empty old note stays empty');
echo "PASS: plain text and old-note conversion (bug 1)\n";

check(noteFormat([]) === 'text' && noteFormat(['format' => 'html']) === 'html', 'format defaults to text');
check(status(fn () => noteFormat(['format' => 'HTML'])) === 422 && status(fn () => noteFormat(['format' => ['html']])) === 422, 'bad format refused');
check(noteBody(['body' => str_repeat('x', NOTE_MAX_BYTES)]) === str_repeat('x', NOTE_MAX_BYTES), '512 KB accepted');
check(status(fn () => noteBody(['body' => str_repeat('x', NOTE_MAX_BYTES + 1)])) === 413, 'over 512 KB refused');
check(status(fn () => noteChecklist([['text' => str_repeat('x', 70000), 'done' => false]])) === 422, 'oversized checklist refused');
check(status(fn () => noteHighlights(array_fill(0, 2000, ['start' => 0, 'end' => 1, 'color' => 'yellow']), 'x')) === 422,
    'oversized highlights refused');
echo "PASS: format input, the 512 KB cap, and the 64 KB checklist and highlight columns\n";
