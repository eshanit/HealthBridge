# Laravel Reverb WebSocket Connection Troubleshooting Guide

## Error Overview

**Error Message:**
```
Firefox can't establish a connection to the server at 
ws://localhost:8080/app/healthbridge?protocol=7&client=js&version=8.4.0&flash=false
```

**Location:** `runtime.ts:115:12`

This error indicates that the WebSocket client (Pusher.js/Laravel Echo) cannot establish a connection to the Laravel Reverb server. The connection is being actively refused.

---

## WebSocket Usage in HealthBridge

### Channels Used

| Channel | Type | Purpose |
|---------|------|---------|
| `gp.dashboard` | Presence | Real-time GP dashboard updates, user presence |
| `referrals` | Public | New referral notifications |
| `sessions.{couchId}` | Private | Session-specific updates |
| `patients.{cpt}` | Private | Patient-specific updates |
| `ai-requests.{requestId}` | Private | AI processing status |

### Events Broadcast

| Event Class | Broadcast Name | Channel(s) |
|-------------|----------------|------------|
| `ReferralCreated` | `.referral.created` | `presence-gp.dashboard`, `referrals` |
| `SessionStateChanged` | `.session.state_changed` | `presence-gp.dashboard`, `sessions.{couchId}`, `referrals` |

### Frontend Implementation

The GP Dashboard ([`Dashboard.vue`](healthbridge_core/resources/js/pages/gp/Dashboard.vue)) uses WebSockets for:

1. **Presence Channel** (`gp.dashboard`):
   - Track online users
   - See who joins/leaves

2. **Public Channel** (`referrals`):
   - Listen for new referrals
   - Listen for session state changes

**Important:** Event names in the frontend must match the `broadcastAs()` method in the backend events. Use the dot prefix (e.g., `.referral.created`) to indicate custom event names.

---

## Quick Diagnosis Checklist

Before diving into detailed troubleshooting, run through this quick checklist:

- [ ] Is the Reverb server running?
- [ ] Is port 8080 available and not blocked?
- [ ] Are the environment variables correctly configured?
- [ ] Is the frontend properly built with Vite?
- [ ] Is the queue worker running? (Events use `ShouldBroadcast`)
- [ ] Do event names match between frontend and backend?

---

## Step 1: Verify Reverb Server Status

### Check if Reverb is Running

The most common cause is that the Reverb server is not running. Open a terminal and run:

```bash
cd healthbridge_core
php artisan reverb:start
```

You should see output similar to:
```
   INFO  Server running at ws://0.0.0.0:8080.  
```

### Run Reverb in Debug Mode

For more detailed logging:

```bash
php artisan reverb:start --debug
```

This will show all connection attempts and help identify issues.

### Run Reverb as a Background Process

For development, you can run Reverb alongside other services:

```bash
# Option 1: Using the dev script (if configured)
composer dev

# Option 2: Run multiple processes manually
# Terminal 1: Laravel server
php artisan serve

# Terminal 2: Reverb WebSocket server
php artisan reverb:start

# Terminal 3: Vite dev server
npm run dev

# Terminal 4: Queue worker (if using queues)
php artisan queue:work
```

---

## Step 2: Verify Port Availability

### Check if Port 8080 is in Use

**Windows (PowerShell):**
```powershell
netstat -ano | findstr :8080
```

**If port is in use**, you'll see output like:
```
TCP    0.0.0.0:8080    0.0.0.0:0    LISTENING    12345
```

### Kill Process Using Port 8080 (if needed)

**Windows:**
```powershell
# Find the process ID (PID)
netstat -ano | findstr :8080

# Kill the process (replace 12345 with actual PID)
taskkill /PID 12345 /F
```

### Alternative: Change Reverb Port

If port 8080 is consistently occupied, update your `.env`:

```env
REVERB_PORT=8081
REVERB_SERVER_PORT=8081
VITE_REVERB_PORT=8081
```

Then restart Reverb and rebuild your frontend:
```bash
php artisan reverb:start
npm run build
```

---

## Step 3: Verify Environment Configuration

### Current Configuration (from `.env`)

Your current configuration:
```env
REVERB_APP_ID=healthbridge-app
REVERB_APP_KEY=healthbridge
REVERB_APP_SECRET=healthbridge-secret
REVERB_HOST=localhost
REVERB_PORT=8080
REVERB_SCHEME=http
REVERB_SERVER_HOST=0.0.0.0
REVERB_SERVER_PORT=8080

VITE_REVERB_APP_KEY="${REVERB_APP_KEY}"
VITE_REVERB_HOST="${REVERB_HOST}"
VITE_REVERB_PORT="${REVERB_PORT}"
VITE_REVERB_SCHEME="${REVERB_SCHEME}"
```

### Verify Configuration is Loaded

Clear and cache your configuration:

```bash
cd healthbridge_core
php artisan config:clear
php artisan config:cache
```

### Verify Vite Environment Variables

The Vite environment variables must be prefixed with `VITE_` to be exposed to the frontend. Verify they're accessible:

```bash
# In your Vue component, add temporary debugging:
console.log('Reverb Config:', {
    key: import.meta.env.VITE_REVERB_APP_KEY,
    host: import.meta.env.VITE_REVERB_HOST,
    port: import.meta.env.VITE_REVERB_PORT,
    scheme: import.meta.env.VITE_REVERB_SCHEME,
});
```

---

## Step 4: Check Frontend Echo Configuration

### Current Echo Setup ([`useEcho.ts`](healthbridge_core/resources/js/composables/useEcho.ts))

The current configuration uses:

```typescript
const config: ReverbConfig = {
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY || 'healthbridge',
    wsHost: import.meta.env.VITE_REVERB_HOST || 'localhost',
    wsPort: parseInt(import.meta.env.VITE_REVERB_PORT || '8080'),
    wssPort: parseInt(import.meta.env.VITE_REVERB_PORT || '8080'),
    forceTLS: import.meta.env.VITE_REVERB_SCHEME === 'https',
    enabledTransports: ['ws', 'wss'],
};
```

### Potential Issue: Missing `wsPort` vs `wssPort` Logic

For HTTP (development), the client should use `wsPort`. For HTTPS (production), it should use `wssPort`. Update the configuration:

```typescript
const config: ReverbConfig = {
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY || 'healthbridge',
    wsHost: import.meta.env.VITE_REVERB_HOST || 'localhost',
    wsPort: parseInt(import.meta.env.VITE_REVERB_PORT || '8080'),
    wssPort: parseInt(import.meta.env.VITE_REVERB_PORT || '8080'),
    forceTLS: import.meta.env.VITE_REVERB_SCHEME === 'https',
    enabledTransports: ['ws', 'wss'],
    disableStats: true,  // Optional: disable stats reporting
    enabledTransports: ['ws', 'wss'],  // Force WebSocket transport
};
```

---

## Step 5: Firewall and Security Software

### Windows Firewall

Check if Windows Firewall is blocking port 8080:

1. Open **Windows Defender Firewall**
2. Click **Advanced settings**
3. Select **Inbound Rules** → **New Rule**
4. Select **Port** → **TCP** → **Specific local ports: 8080**
5. Select **Allow the connection**
6. Apply to all profiles (Domain, Private, Public)
7. Name it "Laravel Reverb WebSocket"

### PowerShell Command to Add Firewall Rule

```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "Laravel Reverb WebSocket" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow
```

### Antivirus Software

Some antivirus software may block WebSocket connections. Temporarily disable to test, or add an exception for:
- `php.exe`
- Port 8080
- Your project directory

---

## Step 6: CORS Configuration

### Check CORS Settings

Verify [`cors.php`](healthbridge_core/config/cors.php) allows WebSocket connections:

```php
return [
    'paths' => ['api/*', 'broadcasting/auth'],
    'allowed_methods' => ['*'],
    'allowed_origins' => ['localhost:8000', 'localhost:5173', 'http://localhost'],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
```

### Broadcasting Authentication Route

Ensure the broadcasting authentication route is accessible:

```bash
# Test the auth endpoint
curl -X POST http://localhost:8000/broadcasting/auth \
  -H "Content-Type: application/json" \
  -H "X-CSRF-TOKEN: your-token" \
  -d '{"socket_id":"test","channel_name":"test"}'
```

---

## Step 7: Debug WebSocket Connection

### Browser DevTools Debugging

1. Open Firefox DevTools (F12)
2. Go to **Network** tab
3. Filter by **WS** (WebSocket)
4. Reload the page
5. Look for the WebSocket connection attempt

**Expected Status:** 101 Switching Protocols
**If you see:** Failed, check the response headers and error details

### Enable Pusher.js Debug Mode

Add this before initializing Echo:

```typescript
// Enable Pusher debug mode
Pusher.logToConsole = true;

// Then initialize Echo
const echo = initializeEcho();
```

This will output detailed WebSocket logs to the browser console.

### Test WebSocket Connection Manually

Use a WebSocket client (like wscat or browser console):

```javascript
// In browser console
const ws = new WebSocket('ws://localhost:8080/app/healthbridge?protocol=7&client=js&version=8.4.0');

ws.onopen = () => console.log('Connected!');
ws.onerror = (error) => console.error('Error:', error);
ws.onclose = () => console.log('Disconnected');
```

---

## Step 8: Common Issues and Solutions

### Issue 1: Reverb Server Not Started

**Symptoms:** Connection refused immediately
**Solution:** Start the Reverb server:
```bash
php artisan reverb:start
```

### Issue 2: Wrong Host Configuration

**Symptoms:** Connection timeout or refused
**Solution:** Ensure `REVERB_HOST` matches your access URL:
- For `localhost` access: `REVERB_HOST=localhost`
- For `127.0.0.1` access: `REVERB_HOST=127.0.0.1`
- For LAN access: `REVERB_HOST=0.0.0.0` (server) and client uses actual IP

### Issue 3: SSL/TLS Mismatch

**Symptoms:** Connection fails with mixed content error
**Solution:** 
- For HTTP (development): `REVERB_SCHEME=http`
- For HTTPS (production): `REVERB_SCHEME=https`

### Issue 4: Vite Not Rebuilt

**Symptoms:** Old configuration in browser
**Solution:** Rebuild the frontend:
```bash
npm run build
# Or for development with hot reload:
npm run dev
```

### Issue 5: Broadcasting Route Not Registered

**Symptoms:** 404 on `/broadcasting/auth`
**Solution:** Ensure routes are registered in [`routes/channels.php`](healthbridge_core/routes/channels.php) and the broadcasting service provider is enabled.

Check `config/app.php`:
```php
'providers' => [
    // ...
    App\Providers\BroadcastServiceProvider::class,
],
```

### Issue 6: Queue Worker Not Running

**Symptoms:** Events not being broadcast, no errors
**Solution:** The events implement `ShouldBroadcast` which uses queues. Start a queue worker:
```bash
php artisan queue:work
```

Or use the dev script which includes the queue worker:
```bash
composer dev:ws
```

### Issue 7: Event Name Mismatch

**Symptoms:** WebSocket connects but events not received
**Solution:** Ensure frontend event names match the `broadcastAs()` method in backend events.

**Backend (`ReferralCreated.php`):**
```php
public function broadcastAs(): string
{
    return 'referral.created';  // Custom name
}
```

**Frontend must use dot prefix for custom names:**
```typescript
// ✅ Correct - matches custom broadcast name
echo.channel('referrals').listen('.referral.created', (event) => { ... });

// ❌ Wrong - won't match
echo.channel('referrals').listen('ReferralCreated', (event) => { ... });
```

---

## Step 9: Production Considerations

### SSL/TLS Configuration

For production with HTTPS:

```env
REVERB_SCHEME=https
REVERB_PORT=443
VITE_REVERB_SCHEME=https
VITE_REVERB_PORT=443
```

### Nginx Configuration

If using Nginx as a reverse proxy:

```nginx
location /app/healthbridge {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Supervisor Configuration

Keep Reverb running in production:

```ini
[program:healthbridge-reverb]
process_name=%(program_name)s
command=php /path/to/healthbridge_core/artisan reverb:start
autostart=true
autorestart=true
user=www-data
redirect_stderr=true
stdout_logfile=/var/log/healthbridge-reverb.log
```

---

## Step 10: Verification Script

Create a verification script to test all components:

```bash
#!/bin/bash
# save as verify-websocket.sh

echo "=== WebSocket Configuration Verification ==="

echo -e "\n1. Checking Reverb server..."
if php artisan reverb:start --test 2>/dev/null; then
    echo "✓ Reverb server can start"
else
    echo "✗ Reverb server failed to start"
fi

echo -e "\n2. Checking port 8080..."
if netstat -ano | findstr :8080 > /dev/null 2>&1; then
    echo "⚠ Port 8080 is in use"
else
    echo "✓ Port 8080 is available"
fi

echo -e "\n3. Checking environment variables..."
php -r "
require 'vendor/autoload.php';
\$app = require_once 'bootstrap/app.php';
\$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();
echo 'REVERB_HOST: ' . env('REVERB_HOST') . PHP_EOL;
echo 'REVERB_PORT: ' . env('REVERB_PORT') . PHP_EOL;
echo 'REVERB_APP_KEY: ' . env('REVERB_APP_KEY') . PHP_EOL;
"

echo -e "\n4. Checking broadcasting config..."
php artisan tinker --execute="echo config('broadcasting.default');"

echo -e "\n=== Verification Complete ==="
```

---

## Quick Fix Summary

1. **Start Reverb server:**
   ```bash
   cd healthbridge_core
   php artisan reverb:start
   ```

2. **Verify the server is running:**
   - Open http://localhost:8080 in browser (should show Reverb info or nothing, not an error)

3. **Clear Laravel cache:**
   ```bash
   php artisan config:clear
   php artisan cache:clear
   ```

4. **Rebuild frontend:**
   ```bash
   npm run build
   ```

5. **Test in browser:**
   - Open DevTools → Network → WS tab
   - Reload page
   - Verify WebSocket connection shows status 101

---

## Additional Resources

- [Laravel Reverb Documentation](https://laravel.com/docs/reverb)
- [Laravel Broadcasting Documentation](https://laravel.com/docs/broadcasting)
- [Pusher.js Documentation](https://pusher.com/docs/channels/using_channels/connection/)
- [WebSocket API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
