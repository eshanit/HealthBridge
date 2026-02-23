# HealthBridge Healthcare System Platform

<p align="center">
  <img src="https://img.shields.io/badge/Laravel-12.x-FF2D20?style=for-the-badge&logo=laravel" alt="Laravel">
  <img src="https://img.shields.io/badge/Nuxt-4.x-00DC82?style=for-the-badge&logo=nuxt.js" alt="Nuxt">
  <img src="https://img.shields.io/badge/Reverb-1.x-FF6B35?style=for-the-badge" alt="Reverb">
  <img src="https://img.shields.io/badge/Ollama-Latest-4B32C3?style=for-the-badge" alt="Ollama">
</p>

> **HealthBridge** is a comprehensive healthcare delivery platform designed for resource-limited settings. It combines offline-first mobile clinical documentation with specialist collaboration tools and AI-powered clinical decision support.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [System Components](#system-components)
- [Prerequisites](#prerequisites)
- [Component Setup Guides](#component-setup-guides)
  - [1. nurse_mobile (Frontliner Mobile Application)](#1-nurse_mobile-frontliner-mobile-application)
  - [2. healthbridge_core (Backend Core Services)](#2-healthbridge_core-backend-core-services)
  - [3. Reverb (WebSocket Infrastructure)](#3-reverb-websocket-infrastructure)
  - [4. Ollama with MedGemma (Local AI/ML Integration)](#4-ollama-with-medgemma-local-aiml-integration)
- [Cross-Component Integration](#cross-component-integration)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contribution Guidelines](#contribution-guidelines)
- [License](#license)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    HEALTHBRIDGE ECOSYSTEM                                              │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                         │
│   ┌────────────────────────────────┐         ┌─────────────────────────────────────────────────┐       │
│   │         nurse_mobile            │         │              healthbridge_core                  │       │
│   │    (Nuxt 4 + Capacitor)        │         │            (Laravel 12 + Inertia)              │       │
│   │                                 │         │                                                  │       │
│   │  ┌──────────────────────────┐   │         │  ┌─────────────────────────────────────────┐  │       │
│   │  │      PouchDB (Local)     │   │         │  │            GP / Specialist Dashboard      │  │       │
│   │  │   (Encrypted Storage)    │   │         │  │                                         │  │       │
│   │  └────────────┬─────────────┘   │         │  │  • Patient Queue Management             │  │       │
│   │               │                   │         │  │  • Clinical Session Review              │  │       │
│   │               │  Live Sync       │         │  │  • Radiology Worklist                   │  │       │
│   │               ▼                   │         │  │  • AI-Powered Insights                  │  │       │
│   │  ┌──────────────────────────┐   │   HTTPS │  └────────────────────┬──────────────────┘  │       │
│   │  │      Secure Sync Service │──────────────►│                      │                      │       │
│   │  └────────────┬─────────────┘   │         │                      ▼                      │       │
│   │               │                   │         │  ┌─────────────────────────────────────────┐  │       │
│   └───────────────┼───────────────────┘         │  │           Laravel API Gateway           │  │       │
│                   │                               │  │  • Authentication (Sanctum)            │  │       │
│                   │                               │  │  • CouchDB Proxy                       │  │       │
│                   │                               │  │  • AI Orchestration                    │  │       │
│                   │                               │  └────────────────────┬──────────────────┘  │       │
│                   │                               │                       │                      │       │
│                   │                               │                       ▼                      │       │
│                   │                               │  ┌──────────────────────────┐              │       │
│                   │                               │  │     CouchDB Bridge       │              │       │
│                   │                               │  │  (Sync Database)        │              │       │
│                   │                               │  └────────────┬───────────┘              │       │
│                   │                               │               │                          │       │
│                   │                               │               │  Sync Worker             │       │
│                   │                               │               │  (polls every 4s)        │       │
│                   │                               │               ▼                          │       │
│                   │                               │  ┌──────────────────────────┐              │       │
│                   └───────────────────────────────►  │      MySQL Database      │◄─────────────┘       │
│                                                     │  (Analytics & Reporting) │                  │
│                                                     └──────────────────────────┘                  │
│                                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    MEDGEMMA AI LAYER                                                  │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────────────────┐       │
│   │                                    Ollama / MedGemma Server                                   │       │
│   │                                                                                              │       │
│   │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │       │
│   │   │  Triage Agent   │  │  Treatment      │  │  Radiology      │  │  Clinical       │  │       │
│   │   │                 │  │  Review Agent    │  │  Analysis Agent │  │  Summarizer     │  │       │
│   │   │  • IMCI Class   │  │  • Plan Review  │  │  • X-Ray Parse   │  │  • EHR Summary  │  │       │
│   │   │  • Explain Why  │  │  • Drug Check   │  │  • CT/MRI Scan  │  │  • SBAR Handoff │  │       │
│   │   │  • Next Steps   │  │  • Guidelines   │  │  • Histopath    │  │  • Guidelines   │  │       │
│   │   └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘  │       │
│   │                                                                                              │       │
│   │   Model: gemma3:4b (configurable)  │  Endpoint: http://localhost:11434                   │       │
│   └─────────────────────────────────────────────────────────────────────────────────────────────┘       │
│                                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack Summary

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Mobile App Framework | Nuxt | 4.x | Vue 3 based web application |
| Mobile Wrapper | Capacitor | 8.x | Cross-platform mobile deployment |
| Local Database | PouchDB | 9.x | Offline-first encrypted storage |
| Backend Framework | Laravel | 12.x | API gateway and business logic |
| Frontend (Core) | Vue 3 + Inertia | Latest | Specialist dashboard |
| Sync Database | CouchDB | 3.x | Document-oriented sync layer |
| Primary Database | MySQL | 8.x | Analytics and reporting |
| WebSocket Server | Laravel Reverb | 1.x | Real-time event broadcasting |
| AI Engine | Ollama | Latest | Local LLM inference |
| AI Model | MedGemma/Gemma | 3:4b | Clinical decision support |

---

## System Components

### 1. nurse_mobile (Frontliner Mobile Application)

A clinical, offline-first mobile application for healthcare workers in rural environments.

**Key Features:**
- ✅ Offline-first operation with PouchDB
- ✅ AES-256 encrypted data storage
- ✅ WHO IMCI triage protocols
- ✅ Real-time sync with CouchDB
- ✅ MedGemma AI integration for clinical guidance

### 2. healthbridge_core (Backend Core Services)

Laravel-based backend providing API gateway, authentication, and specialist dashboard.

**Key Features:**
- ✅ Sanctum-based authentication
- ✅ CouchDB proxy for mobile sync
- ✅ GP/Specialist dashboard with Inertia
- ✅ Radiology workflow management
- ✅ Real-time notifications via Reverb

### 3. Reverb (WebSocket Infrastructure)

Laravel Reverb WebSocket server for real-time event broadcasting.

**Channels Used:**
- `gp.dashboard` - Presence channel for GP dashboard updates
- `referrals` - Public channel for new referral notifications
- `sessions.{couchId}` - Private channel for session updates
- `patients.{cpt}` - Private channel for patient updates
- `ai-requests.{requestId}` - Private channel for AI processing status

### 4. Ollama with MedGemma

Local AI/ML inference server for clinical decision support.

**Supported Use Cases:**
- Triage classification explanation
- Treatment plan review
- Radiology image analysis
- Clinical summary generation

---

## Prerequisites

### Software Requirements

| Requirement | Minimum Version | Recommended Version |
|-------------|-----------------|---------------------|
| PHP | 8.2 | 8.3+ |
| Node.js | 18.x | 20.x LTS |
| Composer | 2.x | Latest |
| MySQL | 8.0 | 8.0+ |
| CouchDB | 3.x | 3.3.x |
| Flutter SDK | 3.x | Latest (for mobile build) |

### Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| RAM | 8 GB | 16 GB |
| CPU | 4 cores | 8+ cores |
| Storage | 20 GB | 50+ GB SSD |
| GPU | None | NVIDIA 8GB+ VRAM (for MedGemma) |

---

## Component Setup Guides

---

### 1. nurse_mobile (Frontliner Mobile Application)

#### Prerequisites

1. **Node.js & npm**
   ```bash
   # Check Node.js version
   node --version  # Should be >= 18.x
   
   # Check npm version
   npm --version   # Should be >= 9.x
   ```

2. **Flutter SDK** (for Android/iOS builds)
   ```bash
   # Install Flutter (Windows/macOS/Linux)
   # Download from: https://flutter.dev/docs/get-started/install
   
   # Verify Flutter installation
   flutter doctor
   ```

3. **Android Studio** (for Android builds)
   - Download from: https://developer.android.com/studio
   - Configure SDK and AVD

#### Installation Steps

##### 1. Clone and Navigate

```bash
cd c:/Users/Admin/Documents/Projects/Tinashe/HealthBridge
cd nurse_mobile
```

##### 2. Install Dependencies

```bash
npm install
```

##### 3. Configure Environment

Copy the example environment file and configure:

```bash
copy .env.example .env
```

Edit `.env` with your configuration:

```env
# ============================================================================
# APPLICATION
# ============================================================================

NUXT_PUBLIC_APP_NAME=HealthBridge
NUXT_PUBLIC_APP_URL=http://localhost:3000

# ============================================================================
# AI CONFIGURATION (Local MedGemma via Ollama)
# ============================================================================

AI_ENABLED=true
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:4b
AI_RATE_LIMIT=30
AI_TIMEOUT=60000
AI_AUTH_TOKEN=local-dev-token
MEDGEMMA_API_KEY=HB-NURSE-001

# ============================================================================
# DATABASE
# ============================================================================

DB_NAME=healthbridge

# ============================================================================
# SECURITY
# ============================================================================

SESSION_KEY_EXPIRATION=86400000

# ============================================================================
# SYNC (if using remote CouchDB)
# ============================================================================

# SYNC_URL=https://your-server.com/db
# SYNC_USER=admin
# SYNC_PASSWORD=password

# ============================================================================
# HEALTHBRIDGE CORE API
# ============================================================================

VITE_API_BASE_URL=http://localhost:8000
```

##### 4. Configure Nuxt (nuxt.config.ts)

The Nuxt configuration is in [`nuxt.config.ts`](nurse_mobile/nuxt.config.ts):

```typescript
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/ui',
    '@nuxtjs/i18n',
    'nuxt-zod-i18n',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
  ],
  css: ['~/assets/css/main.css'],
  ssr: false,
  runtimeConfig: {
    ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'gemma3:4b',
    aiRateLimit: Number(process.env.AI_RATE_LIMIT) || 30,
    aiTimeout: Number(process.env.AI_TIMEOUT) || 60000,
    medgemmaApiKey: process.env.MEDGEMMA_API_KEY || 'HB-NURSE-001',
    public: {
      aiEnabled: process.env.AI_ENABLED === 'true',
      aiAuthToken: process.env.AI_AUTH_TOKEN || 'local-dev-token',
      aiEndpoint: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
      aiModel: process.env.OLLAMA_MODEL || 'gemma3:4b',
      apiBaseUrl: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
    }
  }
})
```

#### Running in Development Mode

##### Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

##### Enable Hot Reload

Hot reload is enabled by default. Changes to:
- `.vue` files → Hot module replacement
- `.ts`/`.js` files → Automatic rebuild
- `.env` changes → Requires server restart

#### Building for Mobile

##### Android Build

```bash
# Add Android platform
npx capacitor add android

# Build Android app
npx capacitor build android

# Run on device/emulator
npx capacitor run android
```

##### iOS Build (macOS only)

```bash
# Add iOS platform
npx capacitor add ios

# Build iOS app
npx capacitor build ios

# Run on simulator
npx capacitor run ios
```

#### Verification Steps

1. ✅ Server starts without errors
2. ✅ Application loads at `http://localhost:3000`
3. ✅ Login page renders correctly
4. ✅ PouchDB initializes in browser
5. ✅ API calls to `VITE_API_BASE_URL` succeed (with backend running)

---

### 2. healthbridge_core (Backend Core Services)

#### Technology Stack

| Component | Technology |
|-----------|------------|
| Language | PHP 8.2+ |
| Framework | Laravel 12.x |
| Database | MySQL 8.x |
| Authentication | Laravel Sanctum |
| Frontend | Vue 3 + Inertia |
| Real-time | Laravel Reverb |

#### Installation Steps

##### 1. Navigate to Project

```bash
cd c:/Users/Admin/Documents/Projects/Tinashe/HealthBridge
cd healthbridge_core
```

##### 2. Install PHP Dependencies

```bash
composer install
```

##### 3. Configure Environment

```bash
copy .env.example .env
```

Edit `.env` with your database and application settings:

```env
# ============================================================================
# APPLICATION
# ============================================================================

APP_NAME=HealthBridge
APP_ENV=local
APP_KEY=
APP_DEBUG=true
APP_URL=http://localhost:8000

# ============================================================================
# DATABASE
# ============================================================================

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=healthbridge
DB_USERNAME=root
DB_PASSWORD=your_password

# ============================================================================
# COUCHDB
# ============================================================================

COUCHDB_URL=http://127.0.0.1:5984
COUCHDB_DATABASE=healthbridge_clinic
COUCHDB_USER=admin
COUCHDB_PASSWORD=your_couchdb_password

# ============================================================================
# BROADCASTING (Reverb)
# ============================================================================

BROADCAST_CONNECTION=reverb
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

# ============================================================================
# SANCTUM
# ============================================================================

SANCTUM_STATE_DURATION=20160
```

##### 4. Generate Application Key

```bash
php artisan key:generate
```

##### 5. Install Frontend Dependencies

```bash
npm install
```

##### 6. Run Database Migrations

```bash
php artisan migrate --force
```

##### 7. Seed Database (Optional - for testing)

```bash
php artisan db:seed
```

#### Running the Backend Server

##### Option 1: Using Composer Scripts

```bash
# Development server with queue worker
composer dev

# Development server with WebSocket (Reverb)
composer dev:ws
```

##### Option 2: Manual Process Start

```bash
# Terminal 1: Laravel server
php artisan serve

# Terminal 2: Queue worker
php artisan queue:listen --tries=1

# Terminal 3: Vite dev server (for frontend)
npm run dev

# Terminal 4: Reverb WebSocket server (if using real-time features)
php artisan reverb:start
```

#### API Documentation

The API runs at `http://localhost:8000`

| Endpoint | Description |
|----------|-------------|
| `/api/auth/*` | Authentication endpoints |
| `/api/couchdb/*` | CouchDB proxy endpoints |
| `/api/ai/*` | AI orchestration endpoints |
| `/api/patients/*` | Patient management |
| `/api/sessions/*` | Clinical sessions |
| `/broadcasting/auth` | WebSocket authentication |

#### Database Migrations

The project includes comprehensive migrations for:

- Users and permissions
- Patients and clinical sessions
- AI request tracking
- Referrals and prescriptions
- Radiology studies

Run migrations:
```bash
php artisan migrate
```

Rollback migrations:
```bash
php artisan migrate:rollback
```

#### Testing Procedures

```bash
# Run all tests
composer test

# Run linting
composer lint

# Run specific test suite
php artisan test --filter=PatientTest
```

#### Verification Steps

1. ✅ `composer install` completes without errors
2. ✅ Application key is generated
3. ✅ Database migrations run successfully
4. ✅ Server starts at `http://localhost:8000`
5. ✅ Login page renders
6. ✅ Sanctum authentication works

---

### 3. Reverb (WebSocket Infrastructure)

#### Purpose and Role

Laravel Reverb provides WebSocket connectivity for real-time features in HealthBridge:

- **Real-time Notifications**: New referrals, session updates
- **Presence Channels**: Online user tracking in GP dashboard
- **Live Updates**: Patient queue changes, AI processing status

#### Installation and Configuration

Reverb is already included in [`composer.json`](healthbridge_core/composer.json):

```json
"require": {
    "laravel/reverb": "^1.0"
}
```

##### Configure Environment

Add to your `.env`:

```env
# ============================================================================
# BROADCASTING (Reverb)
# ============================================================================

BROADCAST_CONNECTION=reverb
REVERB_APP_ID=healthbridge-app
REVERB_APP_KEY=healthbridge
REVERB_APP_SECRET=healthbridge-secret
REVERB_HOST=localhost
REVERB_PORT=8080
REVERB_SCHEME=http
REVERB_SERVER_HOST=0.0.0.0
REVERB_SERVER_PORT=8080
REVERB_CAPACITY=100

VITE_REVERB_APP_KEY="${REVERB_APP_KEY}"
VITE_REVERB_HOST="${REVERB_HOST}"
VITE_REVERB_PORT="${REVERB_PORT}"
VITE_REVERB_SCHEME="${REVERB_SCHEME}"
```

##### Configure Reverb (config/reverb.php)

```php
// config/reverb.php
return [
    'default' => env('REVERB_SERVER', 'reverb'),
    
    'servers' => [
        'reverb' => [
            'host' => env('REVERB_SERVER_HOST', '0.0.0.0'),
            'port' => env('REVERB_SERVER_PORT', 8080),
            'hostname' => env('REVERB_HOST', '127.0.0.1'),
            'max_request_size' => env('REVERB_MAX_REQUEST_SIZE', 10_000),
        ],
    ],
    
    'apps' => [
        'provider' => 'config',
        'apps' => [
            [
                'key' => env('REVERB_APP_KEY'),
                'secret' => env('REVERB_APP_SECRET'),
                'app_id' => env('REVERB_APP_ID'),
                'options' => [
                    'host' => env('REVERB_HOST', '127.0.0.1'),
                    'port' => env('REVERB_PORT', 8080),
                    'scheme' => env('REVERB_SCHEME', 'http'),
                ],
                'allowed_origins' => ['*'],
            ],
        ],
    ],
];
```

#### Running Reverb

##### Start Reverb Server

```bash
php artisan reverb:start
```

Expected output:
```
INFO  Server running at ws://0.0.0.0:8080.
```

##### Run in Debug Mode

```bash
php artisan reverb:start --debug
```

#### WebSocket Channel Setup

##### Channel Definitions (routes/channels.php)

```php
<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('gp.dashboard', function ($user) {
    return $user->hasPermissionTo('view dashboard');
});

Broadcast::channel('sessions.{couchId}', function ($user, $couchId) {
    return $user->hasPermissionTo('view sessions') 
        || $user->id === $this->getSessionOwner($couchId);
});

Broadcast::channel('patients.{cpt}', function ($user, $cpt) {
    return $user->hasPermissionTo('view patients');
});

Broadcast::channel('ai-requests.{requestId}', function ($user, $requestId) {
    return $user->hasPermissionTo('view ai requests');
});
```

#### Event Broadcasting Configuration

##### Broadcasting Events

Events should implement `ShouldBroadcast`:

```php
<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ReferralCreated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $referral;

    public function __construct($referral)
    {
        $this->referral = $referral;
    }

    public function broadcastOn(): array
    {
        return [
            new PresenceChannel('gp.dashboard'),
            new Channel('referrals'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'referral.created';
    }
}
```

#### Frontend Echo Configuration

##### JavaScript Setup (resources/js/bootstrap.js)

```javascript
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Pusher = Pusher;

window.Echo = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST,
    wsPort: import.meta.env.VITE_REVERB_PORT,
    wssPort: import.meta.env.VITE_REVERB_PORT,
    forceTLS: import.meta.env.VITE_REVERB_SCHEME === 'https',
    enabledTransports: ['ws', 'wss'],
});
```

##### Using Echo in Vue Components

```javascript
// Presence channel
Echo.join('gp.dashboard')
    .here((users) => {
        console.log('Online users:', users);
    })
    .joining((user) => {
        console.log('User joined:', user.name);
    })
    .leaving((user) => {
        console.log('User left:', user.name);
    });

// Listen for events
Echo.channel('referrals')
    .listen('.referral.created', (event) => {
        console.log('New referral:', event.referral);
    });
```

#### Connection Handling and Security

##### Authentication

Private channels require authentication:

```php
// routes/channels.php
Broadcast::channel('sessions.{couchId}', function ($user, $couchId) {
    return $user->hasPermissionTo('view sessions');
});
```

##### CORS Configuration

Ensure CORS allows WebSocket connections:

```php
// config/cors.php
return [
    'paths' => ['api/*', 'broadcasting/auth'],
    'allowed_methods' => ['*'],
    'allowed_origins' => ['localhost:8000', 'localhost:5173'],
    'supports_credentials' => true,
];
```

#### Scaling Considerations

For production scaling:

```env
REVERB_SCALING_ENABLED=true
REDIS_URL=redis://127.0.0.1:6379
```

Supervisor configuration:
```ini
[program:healthbridge-reverb]
command=php /path/to/healthbridge_core/artisan reverb:start
autostart=true
autorestart=true
user=www-data
redirect_stderr=true
stdout_logfile=/var/log/healthbridge-reverb.log
```

#### Troubleshooting

See [`docs/REVERB_WEBSOCKET_TROUBLESHOOTING.md`](docs/REVERB_WEBSOCKET_TROUBLESHOOTING.md) for detailed troubleshooting.

**Quick Checklist:**
- [ ] Reverb server running (`php artisan reverb:start`)
- [ ] Port 8080 available
- [ ] Environment variables correctly set
- [ ] Frontend rebuilt after env changes
- [ ] Queue worker running (for events)
- [ ] Event names match (use `.prefix` for custom names)

---

### 4. Ollama with MedGemma (Local AI/ML Integration)

#### Purpose and Role

Ollama provides local LLM inference for clinical decision support without requiring external API calls. MedGemma (based on Google's Gemma) is fine-tuned for medical terminology and clinical workflows.

#### Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| RAM | 8 GB | 16+ GB |
| GPU | None (CPU inference) | NVIDIA 8GB+ VRAM |
| Storage | 10 GB | 20+ GB |

**GPU Recommendations:**
- NVIDIA RTX 3060 (12GB) - Good for 4B models
- NVIDIA RTX 4090 (24GB) - Optimal for larger models
- Apple Silicon (M1+) - Good CPU inference

#### Installing Ollama

##### Windows

```powershell
# Download installer from https://ollama.com/download/windows
# Or use winget
winget install Ollama.Ollama
```

##### macOS

```bash
# Using Homebrew
brew install ollama

# Or download from https://ollama.com/download/mac
```

##### Linux

```bash
# Install curl if needed
curl -fsSL https://ollama.com/install.sh | sh
```

#### Downloading MedGemma Model

##### Install Ollama First

```bash
# Start Ollama service
ollama serve

# In another terminal, pull the model
ollama pull gemma3:4b
```

**Available Models:**
- `gemma3:4b` - Recommended for clinical use (4 billion parameters)
- `gemma3:2b` - Lightweight version for lower-end hardware
- `medgemma:4b` - If available, medical-specific fine-tune

##### Verify Model Installation

```bash
ollama list
```

Should show:
```
NAME              ID          SIZE      MODIFIED
gemma3:4b         ...         2.5GB     ...
```

#### Model Inference Setup

##### Start Ollama Server

```bash
# Start server (default port 11434)
ollama serve

# Or run in background
ollama serve &
```

##### Test Model

```bash
ollama run gemma3:4b "What is the WHO IMCI classification for a child with fast breathing?"
```

#### API Integration with healthbridge_core

##### Configure Environment

Add to `healthbridge_core/.env`:

```env
# ============================================================================
# OLLAMA AI
# ============================================================================

OLLAMA_ENABLED=true
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:4b
OLLAMA_TIMEOUT=60
```

##### Configure in nurse_mobile

In `nurse_mobile/.env`:

```env
AI_ENABLED=true
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:4b
AI_AUTH_TOKEN=local-dev-token
MEDGEMMA_API_KEY=HB-NURSE-001
```

#### Using the AI API

##### Server-Side API (healthbridge_core)

The backend provides AI orchestration:

```bash
# POST /api/ai/chat
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "Explain the triage for a child with cough and difficulty breathing",
    "context": {
      "age_months": 24,
      "findings": {
        "respiratory_rate": 52,
        "chest_indrawing": true,
        "wheezing": false
      }
    }
  }'
```

##### Client-Side API (nurse_mobile)

The mobile app can call Ollama directly or via proxy:

```typescript
// Direct call to Ollama
const response = await fetch('http://127.0.0.1:11434/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gemma3:4b',
    prompt: 'Explain the triage classification...',
    stream: false
  })
});

const data = await response.json();
console.log(data.response);
```

#### Performance Optimization

##### GPU Acceleration

```bash
# Check GPU availability
ollama list

# Run with GPU (automatic if CUDA available)
ollama run gemma3:4b
```

##### Model Quantization

For lower memory usage:

```bash
# Use quantized model (Q4_K_M - 4-bit quantization)
ollama run gemma3:4b:Q4_K_M
```

##### Concurrent Requests

Configure in `nuxt.config.ts`:

```typescript
runtimeConfig: {
  aiRateLimit: 30,      // Max requests per minute
  aiTimeout: 60000,     // 60 second timeout
}
```

#### Monitoring Resource Usage

##### Check Ollama Status

```bash
# List running models
ollama list

# Check server logs
# Windows: Check Ollama service in Services app
# Linux/macOS: Check journalctl or system logs
```

##### Monitor System Resources

```bash
# Linux
htop
nvidia-smi

# Windows
taskmanager
```

##### Health Check Endpoint

```bash
# Check Ollama is running
curl http://127.0.0.1:11434/api/tags
```

---

## Cross-Component Integration

### Data Flow Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Mobile     │────►│   Laravel     │────►│  CouchDB    │────►│    MySQL     │
│   (PouchDB)  │     │   (Proxy)     │     │   (Sync)    │     │  (Primary)   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │    Reverb    │
                    │  (WebSocket) │
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   Ollama     │
                    │  (MedGemma)  │
                    └──────────────┘
```

### Integration Checklist

1. **CouchDB → Laravel Proxy**
   - [ ] CouchDB running on port 5984
   - [ ] Laravel proxy configured in routes
   - [ ] Sanctum authentication working

2. **CouchDB → MySQL Sync**
   - [ ] Sync worker running (`php artisan sync:work`)
   - [ ] Database migrations complete
   - [ ] Sync worker polling every 4 seconds

3. **Real-time Updates**
   - [ ] Reverb server running on port 8080
   - [ ] Frontend Echo configured
   - [ ] Channel authorization working

4. **AI Integration**
   - [ ] Ollama running on port 11434
   - [ ] Model loaded (gemma3:4b)
   - [ ] API endpoints accessible

---

## Development Workflow

### Starting All Services

```bash
# Terminal 1: CouchDB
# Install and run CouchDB, ensure running on port 5984

# Terminal 2: Ollama
ollama serve
# In another terminal: ollama pull gemma3:4b (first time)

# Terminal 3: Laravel Backend
cd healthbridge_core
php artisan serve

# Terminal 4: Queue Worker
cd healthbridge_core
php artisan queue:listen --tries=1

# Terminal 5: Reverb WebSocket
cd healthbridge_core
php artisan reverb:start

# Terminal 6: Frontend Build
cd healthbridge_core
npm run dev

# Terminal 7: Mobile App
cd nurse_mobile
npm run dev
```

### Project Structure

```
HealthBridge/
├── nurse_mobile/              # Frontliner Mobile App
│   ├── app/                   # Nuxt app source
│   │   ├── components/        # Vue components
│   │   ├── pages/             # Application pages
│   │   ├── services/          # Business logic
│   │   └── schemas/           # Zod validation schemas
│   ├── server/                # Server-side API routes
│   └── docs/                  # Mobile-specific docs
│
├── healthbridge_core/         # Laravel Backend
│   ├── app/                   # Application code
│   │   ├── Http/              # Controllers
│   │   ├── Services/          # Business services
│   │   └── Events/            # Broadcast events
│   ├── config/                # Configuration files
│   ├── database/              # Migrations & seeders
│   └── resources/             # Frontend assets
│
├── docs/                      # Project documentation
│   ├── REVERB_WEBSOCKET_TROUBLESHOOTING.md
│   ├── DATA_SYNCHRONIZATION_ARCHITECTURE.md
│   └── MEDGEMMA_COMPETITION_WRITUP.md
│
└── GATEWAY.md                 # CouchDB integration guide
```

---

## Testing

### Backend Tests

```bash
cd healthbridge_core

# Run all tests
composer test

# Run specific test
php artisan test --filter=PatientControllerTest

# Run with coverage
php artisan test --coverage
```

### Mobile App Tests

```bash
cd nurse_mobile

# Run unit tests
npm run test

# Run e2e tests (if configured)
npm run test:e2e
```

### Integration Testing

Test the complete data flow:

1. Create patient in mobile app
2. Verify CouchDB sync
3. Verify MySQL sync
4. Verify real-time update in dashboard
5. Verify AI inference works

---

## Troubleshooting

### Common Issues

#### 1. Mobile App Can't Connect to Backend

**Symptom:** API requests fail with 401/404

**Solution:**
```bash
# Check Laravel is running
php artisan serve

# Verify .env API URL in nurse_mobile
cat nurse_mobile/.env | grep VITE_API_BASE_URL

# Rebuild mobile app after env change
npm run build
```

#### 2. WebSocket Connection Failed

**Symptom:** `Firefox can't establish a connection to the server`

**Solution:**
```bash
# Verify Reverb is running
php artisan reverb:start

# Check port 8080 is available
netstat -ano | findstr :8080

# Clear config cache
php artisan config:clear
```

#### 3. AI Not Responding

**Symptom:** AI requests timeout

**Solution:**
```bash
# Check Ollama is running
curl http://127.0.0.1:11434/api/tags

# Verify model is loaded
ollama list

# Check logs
# Ollama logs in system event viewer (Windows)
```

#### 4. Sync Not Working

**Symptom:** Data not appearing in CouchDB/MySQL

**Solution:**
```bash
# Check CouchDB is running
curl http://127.0.0.1:5984

# Check sync worker is running
php artisan queue:work

# Check Laravel logs
tail -f storage/logs/laravel.log
```

#### 5. Database Migrations Failing

**Symptom:** Migration errors

**Solution:**
```bash
# Check database connection
php artisan migrate:status

# Reset migrations if needed (development only)
php artisan migrate:fresh --seed
```

### Getting Help

1. Check [`docs/`](docs/) for detailed documentation
2. Review existing GitHub issues
3. Check Laravel logs: `storage/logs/laravel.log`
4. Check browser console for frontend errors

---

## Contribution Guidelines

### Getting Started

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

### Code Style

- **PHP**: Follow Laravel coding standards (Pint)
- **JavaScript/TypeScript**: Follow ESLint/Prettier
- **Vue Components**: Use Composition API

```bash
# Lint PHP
cd healthbridge_core
composer lint

# Lint JS
cd nurse_mobile
npm run lint
```

### Commit Messages

Use conventional commits:

```
feat: Add new triage assessment
fix: Resolve sync conflict issue
docs: Update API documentation
refactor: Improve AI response handling
test: Add integration tests for sync
```

### Testing Requirements

- All new features must include tests
- Ensure existing tests pass
- Test on multiple environments (Windows, macOS, Linux)

### Documentation

- Update README.md for user-facing changes
- Update code comments for complex logic
- Add API documentation for new endpoints

---

## License

This project is proprietary software for the HealthBridge healthcare system.

---

## Additional Resources

- [Laravel Documentation](https://laravel.com/docs)
- [Nuxt Documentation](https://nuxt.com/docs)
- [Laravel Reverb Documentation](https://laravel.com/docs/reverb)
- [Ollama Documentation](https://github.com/ollama/ollama)
- [PouchDB Documentation](https://pouchdb.com/)
- [WHO IMCI Guidelines](https://www.who.int/publications/i/item/9789241514783)

---

<p align="center">
  Built with ❤️ for healthcare workers worldwide
</p>
