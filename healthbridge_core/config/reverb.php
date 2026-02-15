<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Reverb Server Configuration
    |--------------------------------------------------------------------------
    |
    | This option controls the Reverb WebSocket server configuration.
    |
    */

    'server' => [
        'host' => env('REVERB_SERVER_HOST', '0.0.0.0'),
        'port' => env('REVERB_SERVER_PORT', 8080),
        'hostname' => env('REVERB_HOST', 'localhost'),
        'options' => [
            'tls' => env('REVERB_TLS_ENABLED', false) ? [
                'local_cert' => env('REVERB_TLS_CERT'),
                'local_pk' => env('REVERB_TLS_KEY'),
            ] : null,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Reverb Applications
    |--------------------------------------------------------------------------
    |
    | Here you may define the applications that will use Reverb.
    |
    */

    'apps' => [
        [
            'app_id' => env('REVERB_APP_ID', 'healthbridge-app'),
            'key' => env('REVERB_APP_KEY', 'healthbridge'),
            'secret' => env('REVERB_APP_SECRET', 'healthbridge-secret'),
            'capacity' => env('REVERB_CAPACITY', 100),
            'enable_client_messages' => env('REVERB_ENABLE_CLIENT_MESSAGES', false),
            'enable_statistics' => env('REVERB_ENABLE_STATISTICS', true),
            'statistics_interval' => env('REVERB_STATISTICS_INTERVAL', 60),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Scaling Configuration
    |--------------------------------------------------------------------------
    |
    | Configure horizontal scaling for Reverb.
    |
    */

    'scaling' => [
        'enabled' => env('REVERB_SCALING_ENABLED', false),
        'channel' => env('REVERB_SCALING_CHANNEL', 'reverb'),
        'server_id' => env('REVERB_SERVER_ID', uniqid()),
    ],

];
