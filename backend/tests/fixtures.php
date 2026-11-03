<?php
declare(strict_types=1);
// Small real files for the syllabus tests, built here so no fixture files or zip extension are needed.

// A zip archive with the given files, deflated or stored.
function zipOf(array $files, bool $deflate = true): string
{
    $body = '';
    $directory = '';
    foreach ($files as $name => $content) {
        $data = $deflate ? gzdeflate($content) : $content;
        $header = pack('vvvvvVVVvv', 20, 0, $deflate ? 8 : 0, 0, 0, crc32($content), strlen($data), strlen($content), strlen($name), 0);
        $directory .= "PK\x01\x02" . pack('v', 20) . $header . pack('vvvVV', 0, 0, 0, 0, strlen($body)) . $name;
        $body .= "PK\x03\x04" . $header . $name . $data;
    }
    return $body . $directory . "PK\x05\x06" . pack('vvvvVVv', 0, 0, count($files), count($files), strlen($directory), strlen($body), 0);
}

// A Word document holding one paragraph per line of $text.
function docxOf(string $text, array $extra = []): string
{
    $paragraphs = implode('', array_map(fn ($line) => '<w:p><w:r><w:t>' . htmlspecialchars($line, ENT_XML1) . '</w:t></w:r></w:p>',
        explode("\n", $text)));
    return zipOf(['[Content_Types].xml' => '<Types/>', 'word/document.xml' => "<w:document><w:body>$paragraphs</w:body></w:document>"] + $extra);
}

// A one-page PDF with a single line of text.
function pdfOf(string $line): string
{
    $stream = 'BT /F1 12 Tf 72 720 Td (' . addcslashes($line, '()\\') . ') Tj ET';
    return "%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj\n"
        . "3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>> endobj\n"
        . "4 0 obj <</Type/Font/Subtype/Type1/BaseFont/Helvetica>> endobj\n"
        . '5 0 obj <</Length ' . strlen($stream) . ">> stream\n$stream\nendstream endobj\ntrailer <</Root 1 0 R>>\n%%EOF\n";
}

// 1x1 images in each supported format.
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const JPG_1PX = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const WEBP_1PX = 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
