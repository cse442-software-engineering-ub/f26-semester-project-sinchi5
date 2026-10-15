<?php
// Copy OUTSIDE the served directory. Use NOTELY_CONFIG or config-path.example.php to locate it.
// Keep credentials private; the PHP execution user must be able to read this file.
// Do not put real credentials in this example or any committed file.
return [
    'db_name' => 'cse442_2026_fall_team_c_db',
    'db_user' => 'YOUR_UBIT_USERNAME',
    'db_password' => 'YOUR_DATABASE_PASSWORD',
    // Generate with: php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'
    'app_key' => 'REPLACE_WITH_64_RANDOM_HEX_CHARACTERS',
    'origin' => 'https://aptitude.cse.buffalo.edu',
    'cookie_path' => '/CSE442/2026-Fall/cse-442c/',
    'secure_cookies' => true,
    // Optional: read PDF, DOCX, and image syllabi with the Claude API. TXT and Markdown never use it.
    // Leave the key out to keep automatic reading off. Local origins never call the API unless
    // NOTELY_AI_LIVE=1 is set for that run.
    // 'anthropic_api_key' => 'YOUR_ANTHROPIC_API_KEY',
    // 'anthropic_model' => 'claude-opus-5-5',  // 'claude-haiku-5-5' costs about 40 times less per token
    // 'ai_user_daily_limit' => 5,               // automatic reads per student per day
    // 'ai_daily_limit' => 50,                   // automatic reads for all students per day
    // 'ai_max_input_tokens' => 60000,           // longer files are refused before they cost anything
];
