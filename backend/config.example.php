<?php
// Copy OUTSIDE the served directory, chmod 600, and set NOTELY_CONFIG to its path.
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
];
