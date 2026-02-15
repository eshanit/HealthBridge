# HealthBridge

A comprehensive healthcare platform connecting General Practitioners and Nurses for streamlined patient care.

## Project Structure

```
HealthBridge/
├── healthbridge_core/     # Laravel backend with Vue.js frontend (GP Dashboard)
│   ├── app/               # Application logic
│   ├── database/          # Migrations and seeders
│   ├── resources/         # Frontend assets (Vue.js)
│   └── ...
│
└── nurse_mobile/          # Nuxt.js mobile app for nurses
    ├── pages/             # Application pages
    ├── components/        # Vue components
    └── ...
```

## Features

- **GP Dashboard**: Clinical session management, patient records, AI-assisted diagnostics
- **Nurse Mobile App**: On-the-go patient care and coordination
- **Real-time Sync**: CouchDB synchronization between systems
- **AI Integration**: MedGemma AI for clinical decision support

## Tech Stack

### Backend (healthbridge_core)
- Laravel 11
- PHP 8.2+
- MySQL/PostgreSQL
- CouchDB (for offline-first sync)
- Redis (caching & queues)

### Frontend
- Vue.js 3 + Inertia.js (GP Dashboard)
- Nuxt.js 3 (Nurse Mobile)
- TypeScript
- Tailwind CSS

## Getting Started

### Prerequisites
- PHP 8.2+
- Node.js 18+
- Composer
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/HealthBridge.git
   cd HealthBridge
   ```

2. Setup healthbridge_core:
   ```bash
   cd healthbridge_core
   composer install
   npm install
   cp .env.example .env
   php artisan key:generate
   php artisan migrate
   ```

3. Setup nurse_mobile:
   ```bash
   cd ../nurse_mobile
   npm install
   cp .env.example .env
   ```

## License

Proprietary - All rights reserved.
