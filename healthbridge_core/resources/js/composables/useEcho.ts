import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

declare global {
    interface Window {
        Echo: Echo<any>;
        Pusher: typeof Pusher;
    }
}

export interface ReverbConfig {
    broadcaster: 'reverb';
    key: string;
    wsHost: string;
    wsPort: number;
    wssPort?: number;
    forceTLS?: boolean;
    enabledTransports?: string[];
    authorizer?: (channel: { name: string }, options: unknown) => {
        authorize: (socketId: string, callback: (auth: unknown, error: unknown) => void) => void;
    };
}

export function initializeEcho(): Echo<any> | null {
    // Only initialize on client side
    if (typeof window === 'undefined') {
        return null;
    }

    // Check if Echo is already initialized
    if (window.Echo) {
        return window.Echo;
    }

    // Get configuration from meta tags or environment
    const config: ReverbConfig = {
        broadcaster: 'reverb',
        key: import.meta.env.VITE_REVERB_APP_KEY || 'healthbridge',
        wsHost: import.meta.env.VITE_REVERB_HOST || 'localhost',
        wsPort: parseInt(import.meta.env.VITE_REVERB_PORT || '8080'),
        wssPort: parseInt(import.meta.env.VITE_REVERB_PORT || '8080'),
        forceTLS: import.meta.env.VITE_REVERB_SCHEME === 'https',
        enabledTransports: ['ws', 'wss'],
    };

    // Add authorizer for private/presence channels
    config.authorizer = (channel, options) => {
        return {
            authorize: (socketId, callback) => {
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
                    .then(response => response.json())
                    .then(data => callback(null, data))
                    .catch(error => callback(error, null));
            },
        };
    };

    // Make Pusher available globally (required by Laravel Echo)
    window.Pusher = Pusher;

    // Initialize Echo
    const echo = new Echo<any>(config);
    window.Echo = echo;

    return echo;
}

export function useEcho(): Echo<any> | null {
    if (typeof window === 'undefined') {
        return null;
    }

    if (!window.Echo) {
        return initializeEcho();
    }

    return window.Echo;
}

export function disconnectEcho(): void {
    if (window.Echo) {
        window.Echo.disconnect();
        window.Echo = undefined as unknown as Echo<any>;
    }
}

// Type-safe channel subscription helpers
export function subscribeToChannel(channelName: string) {
    const echo = useEcho();
    if (!echo) return null;
    return echo.channel(channelName);
}

export function subscribeToPrivate(channelName: string) {
    const echo = useEcho();
    if (!echo) return null;
    return echo.private(channelName);
}

export function subscribeToPresence(channelName: string) {
    const echo = useEcho();
    if (!echo) return null;
    return echo.join(channelName);
}

export function leaveChannel(channelName: string) {
    const echo = useEcho();
    if (!echo) return;
    echo.leave(channelName);
}
