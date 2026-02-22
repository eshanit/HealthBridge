<?php

/**
 * Broadcasting Configuration
 * 
 * This file configures how Laravel broadcasts events to various
 * real-time services including Laravel Reverb, Pusher, and others.
 * 
 * @see https://laravel.com/docs/broadcasting
 */

return [

    /*
    |--------------------------------------------------------------------------
    | Default Broadcaster
    |--------------------------------------------------------------------------
    |
    | This option controls the default broadcaster that will be used by the
    | framework when an event needs to be broadcast. You may set this to
    | any of the connections defined in the "connections" array below.
    |
    | Supported: "reverb", "pusher", "ably", "log", "null"
    |
    */

    'default' => env('BROADCAST_CONNECTION', 'reverb'),

    /*
    |--------------------------------------------------------------------------
    | Broadcast Connections
    |--------------------------------------------------------------------------
    |
    | Here you may define all of the broadcast connections that will be used
    | to broadcast events to other systems or over WebSockets. Each connection
    | has different configuration options.
    |
    */

    'connections' => [

        /*
        |--------------------------------------------------------------------------
        | Laravel Reverb
        |--------------------------------------------------------------------------
        |
        | Laravel Reverb provides a WebSocket server for real-time broadcasting.
        | This is the recommended broadcaster for Laravel applications.
        |
        */
        'reverb' => [
            'driver' => 'reverb',
            'key' => env('REVERB_APP_KEY'),
            'secret' => env('REVERB_APP_SECRET'),
            'app_id' => env('REVERB_APP_ID'),
            'options' => [
                'host' => env('REVERB_HOST', '127.0.0.1'),
                'port' => env('REVERB_PORT', 8080),
                'scheme' => env('REVERB_SCHEME', 'http'),
                'encrypted' => env('REVERB_ENCRYPTED', false),
                'cluster' => env('PUSHER_CLUSTER'),
                'curl_opts' => [],
            ],
            'client_options' => [
                // Guzzle HTTP client options
                // See: https://docs.guzzlephp.org/en/stable/request-options.html
            ],
        ],

        /*
        |--------------------------------------------------------------------------
        | Pusher Channels
        |--------------------------------------------------------------------------
        |
        | If you prefer using Pusher instead of Reverb, configure your
        | Pusher credentials below.
        |
        */
        'pusher' => [
            'driver' => 'pusher',
            'key' => env('PUSHER_APP_KEY'),
            'secret' => env('PUSHER_APP_SECRET'),
            'app_id' => env('PUSHER_APP_ID'),
            'options' => [
                'cluster' => env('PUSHER_APP_CLUSTER', 'mt1'),
                'host' => env('PUSHER_HOST', 'api-'.env('PUSHER_APP_CLUSTER', 'mt1').'.pusher.com'),
                'port' => env('PUSHER_PORT', 443),
                'scheme' => env('PUSHER_SCHEME', 'https'),
                'encrypted' => true,
                'useTLS' => env('PUSHER_SCHEME', 'https') === 'https',
            ],
            'client_options' => [
                // Guzzle HTTP client options
            ],
        ],

        /*
        |--------------------------------------------------------------------------
        | Ably
        |--------------------------------------------------------------------------
        |
        | Ably is another real-time messaging service that can be used
        | for broadcasting events.
        |
        */
        'ably' => [
            'driver' => 'ably',
            'key' => env('ABLY_KEY'),
        ],

        /*
        |--------------------------------------------------------------------------
        | Log Broadcaster
        |--------------------------------------------------------------------------
        |
        | The log broadcaster will write all broadcast events to your
        | application log. This is useful for local development.
        |
        */
        'log' => [
            'driver' => 'log',
        ],

        /*
        |--------------------------------------------------------------------------
        | Null Broadcaster
        |--------------------------------------------------------------------------
        |
        | The null broadcaster discards all broadcast events. Use this
        | when running tests or when broadcasting is not needed.
        |
        */
        'null' => [
            'driver' => 'null',
        ],

    ],

];
