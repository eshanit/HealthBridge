/**
 * Laravel Echo Composable
 * 
 * This composable initializes and manages Laravel Echo for real-time
 * WebSocket connections via Laravel Reverb.
 * 
 * @see https://laravel.com/docs/reverb
 * @see https://laravel-echo.readthedocs.io
 */

import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

// Extend Window interface for TypeScript
declare global {
    interface Window {
        Echo: Echo<any>;
        Pusher: typeof Pusher;
    }
}

/**
 * Reverb Configuration Interface
 */
export interface ReverbConfig {
    broadcaster: 'reverb' | 'pusher';
    key: string;
    wsHost: string;
    wsPort: number;
    wssPort?: number;
    wsPath?: string;
    forceTLS?: boolean;
    enabledTransports?: string[];
    disableStats?: boolean;
    encrypted?: boolean;
    authorizer?: (channel: { name: string }, options: unknown) => {
        authorize: (socketId: string, callback: (auth: unknown, error: unknown) => void) => void;
    };
}

/**
 * Get Reverb configuration from environment variables
 */
function getReverbConfig(): ReverbConfig {
    const appKey = import.meta.env.VITE_REVERB_APP_KEY || '';
    const host = import.meta.env.VITE_REVERB_HOST || '127.0.0.1';
    const port = parseInt(import.meta.env.VITE_REVERB_PORT || '8080', 10);
    const scheme = import.meta.env.VITE_REVERB_SCHEME || 'http';
    const path = import.meta.env.VITE_REVERB_PATH || '';
    
    const useTLS = scheme === 'https';
    
    // Debug logging in development
    if (import.meta.env.DEV) {
        console.log('[Reverb] Initializing with config:', {
            appKey: appKey ? `${appKey.substring(0, 8)}...` : '(empty)',
            host,
            port,
            scheme,
            path,
            useTLS,
        });
    }

    const config: ReverbConfig = {
        broadcaster: 'reverb',
        key: appKey,
        wsHost: host,
        wsPort: port,
        wssPort: port,
        wsPath: path,
        forceTLS: useTLS,
        enabledTransports: ['ws', 'wss'],
        disableStats: true,
        encrypted: false,
    };

    // Configure authorizer for private/presence channels
    config.authorizer = (channel, options) => {
        return {
            authorize: (socketId: string, callback: (auth: unknown, error: unknown) => void) => {
                if (import.meta.env.DEV) {
                    console.log('[Reverb] Authorizing channel:', channel.name, 'Socket ID:', socketId);
                }
                
                fetch('/broadcasting/auth', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                        'X-Socket-Id': socketId,
                    },
                    body: JSON.stringify({
                        socket_id: socketId,
                        channel_name: channel.name,
                    }),
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Authorization failed: ${response.status} ${response.statusText}`);
                    }
                    return response.json();
                })
                .then(data => {
                    if (import.meta.env.DEV) {
                        console.log('[Reverb] Authorization successful for channel:', channel.name);
                    }
                    callback(null, data);
                })
                .catch(error => {
                    console.error('[Reverb] Authorization error:', error);
                    callback(error, null);
                });
            },
        };
    };

    return config;
}

/**
 * Initialize Laravel Echo for WebSocket connections
 * 
 * @returns Echo instance or null if on server-side
 */
export function initializeEcho(): Echo<any> | null {
    // Only initialize on client side
    if (typeof window === 'undefined') {
        return null;
    }

    // Return existing instance if already initialized
    if (window.Echo) {
        return window.Echo;
    }

    // Enable Pusher debug mode in development
    if (import.meta.env.DEV) {
        Pusher.logToConsole = true;
    }

    // Get configuration from environment
    const config = getReverbConfig();

    // Validate configuration
    if (!config.key) {
        console.error('[Reverb] ERROR: REVERB_APP_KEY is not set. Check your .env file.');
        return null;
    }

    // Make Pusher available globally (required by Laravel Echo)
    window.Pusher = Pusher;

    // Initialize Echo
    try {
        const echo = new Echo<any>(config);
        window.Echo = echo;

        // Log connection events in development
        if (import.meta.env.DEV) {
            echo.connector.pusher.connection.bind('connected', () => {
                console.log('[Reverb] ✓ WebSocket connected successfully');
            });

            echo.connector.pusher.connection.bind('disconnected', () => {
                console.warn('[Reverb] ✗ WebSocket disconnected');
            });

            echo.connector.pusher.connection.bind('error', (err: Error) => {
                console.error('[Reverb] ✗ WebSocket connection error:', err.message);
            });

            echo.connector.pusher.connection.bind('state_change', (states: { previous: string; current: string }) => {
                console.log('[Reverb] Connection state:', states.previous, '→', states.current);
            });
        }

        return echo;
    } catch (error) {
        console.error('[Reverb] Failed to initialize Echo:', error);
        return null;
    }
}

/**
 * Get the Echo instance, initializing if necessary
 * 
 * @returns Echo instance or null
 */
export function useEcho(): Echo<any> | null {
    if (typeof window === 'undefined') {
        return null;
    }

    if (!window.Echo) {
        return initializeEcho();
    }

    return window.Echo;
}

/**
 * Disconnect Echo from the WebSocket server
 */
export function disconnectEcho(): void {
    if (window.Echo) {
        window.Echo.disconnect();
        window.Echo = undefined as unknown as Echo<any>;
        
        if (import.meta.env.DEV) {
            console.log('[Reverb] Disconnected');
        }
    }
}

/**
 * Subscribe to a public channel
 * 
 * @param channelName - The name of the channel
 * @returns Channel instance or null
 */
export function subscribeToChannel(channelName: string) {
    const echo = useEcho();
    if (!echo) return null;
    return echo.channel(channelName);
}

/**
 * Subscribe to a private channel
 * 
 * @param channelName - The name of the channel
 * @returns Private channel instance or null
 */
export function subscribeToPrivate(channelName: string) {
    const echo = useEcho();
    if (!echo) return null;
    return echo.private(channelName);
}

/**
 * Subscribe to a presence channel
 * 
 * @param channelName - The name of the channel
 * @returns Presence channel instance or null
 */
export function subscribeToPresence(channelName: string) {
    const echo = useEcho();
    if (!echo) return null;
    return echo.join(channelName);
}

/**
 * Leave a channel
 * 
 * @param channelName - The name of the channel to leave
 */
export function leaveChannel(channelName: string): void {
    const echo = useEcho();
    if (!echo) return;
    echo.leave(channelName);
}

/**
 * Check if Echo is currently connected
 * 
 * @returns true if connected, false otherwise
 */
export function isEchoConnected(): boolean {
    if (!window.Echo) return false;
    return window.Echo.connector.pusher.connection.state === 'connected';
}
