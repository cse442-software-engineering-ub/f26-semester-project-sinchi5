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
    // Optional: read syllabi the browser's free rules can't (scans, photos, unusual layouts) with
    // Google's Gemini API. Get a key at https://aistudio.google.com/apikey and paste it here, in the
    // private copy only. Leave it out to keep automatic reading off. Local origins never call the API
    // unless NOTELY_AI_LIVE=1 is set for that run.
    // 'gemini_api_key' => 'YOUR_GOOGLE_AI_STUDIO_KEY',
    // 'gemini_model' => 'gemini-3.5-flash-lite',  // cheapest; 'gemini-3.8-flash' is stronger
    // 'ai_user_daily_limit' => 5,                 // automatic reads per student per day
    // 'ai_daily_limit' => 50,                     // automatic reads for all students per day
    // 'ai_max_input_tokens' => 60000,             // longer files are refused before they are read
];
