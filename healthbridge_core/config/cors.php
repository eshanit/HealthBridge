<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api', 'api/', 'api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    // When supports_credentials is true, you cannot use '*'
    // Must specify exact origins
    'allowed_origins' => [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:3004',
        'http://localhost:3005',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:3002',
        'http://127.0.0.1:3003',
        'http://127.0.0.1:3004',
        'http://127.0.0.1:3005',
        'http://127.0.0.1:5984'
    ],

    // Regex patterns to match any localhost/127.0.0.1 port
    'allowed_origins_patterns' => [
        '/^http:\/\/localhost:\d+$/',
        '/^http:\/\/127\.0\.0\.1:\d+$/'
    ],

    'allowed_headers' => ['*'],

    'exposed_headers' => ['ETag', 'X-CouchDB-Update-Seq', 'X-CouchDB-Request-ID'],

    'max_age' => 86400, // 24 hours for preflight caching

    // Must be true for Sanctum cookie-based auth
    // But requires specific allowed_origins (not '*')
    'supports_credentials' => true,

];
