# HealthBridge Nurse Mobile

A clinical, offline-first mobile application for healthcare workers.

## Documentation

All project documentation is organized in the [`docs/`](docs/) folder:

### Core Architecture
- **[`docs/architecture/ARCHITECTURE_RULES.md`](docs/architecture/ARCHITECTURE_RULES.md)** - Authoritative architecture guidelines

### Development Phases
- **[`docs/flows/PHASE3_WORKFLOW.md`](docs/flows/PHASE3_WORKFLOW.md)** - Phase 3 clinical workflow spec
- **[`docs/flows/PHASE3_COMPLETE.md`](docs/flows/PHASE3_COMPLETE.md)** - Phase 3 completion report
- **[`docs/prompts/PHASE_3_SESSIONS.prompt.md`](docs/prompts/PHASE_3_SESSIONS.prompt.md)** - Phase 3 prompts
- **[`docs/prompts/PHASE_4_SESSIONS.prompt.md`](docs/prompts/PHASE_4_SESSIONS.prompt.md)** - Phase 4 prompts

### Technical Specifications
- **[`docs/specs/dashboard-state-machine.md`](docs/specs/dashboard-state-machine.md)** - Dashboard state machine
- **[`docs/specs/triage-to-treatment-bridge.md`](docs/specs/triage-to-treatment-bridge.md)** - Triage treatment bridge

### Concept Definitions
- **[`docs/definitions/sessions.md`](docs/definitions/sessions.md)** - Session concepts
- **[`docs/definitions/sessions-vs-assessment.md`](docs/definitions/sessions-vs-assessment.md)** - Sessions vs assessments
- **[`docs/definitions/dashboard.md`](docs/definitions/dashboard.md)** - Dashboard definitions

### Migration & Guides
- **[`docs/migration/MIGRATION_COMPLETED.md`](docs/migration/MIGRATION_COMPLETED.md)** - NuxtUI to Tailwind migration
- **[`docs/guides/SESSION_TABS_FIX.md`](docs/guides/SESSION_TABS_FIX.md)** - Session tabs fix guide
- **[`docs/guides/DARK_THEME_FIX.md`](docs/guides/DARK_THEME_FIX.md)** - Dark theme fix guide

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Tech Stack

- **Framework**: Nuxt 4 (SPA)
- **Mobile**: Capacitor Android
- **Local DB**: PouchDB (IndexedDB)
- **Sync**: CouchDB HTTP
- **Validation**: Zod
- **Encryption**: WebCrypto AES-256

## Project Structure

```
app/
├── components/
│   ├── clinical/       # Clinical workflow components
│   └── ui/             # UI components
├── composables/        # Vue composables
├── pages/              # Application pages
├── schemas/            # Zod validation schemas
├── services/           # Business logic services
└── types/              # TypeScript types
```

## Key Features

- ✅ Offline-first operation
- ✅ Encrypted data storage
- ✅ Clinical workflow management
- ✅ WHO IMCI triage logic
- ✅ Bi-directional sync

## Development

See [`docs/prompts/`](docs/prompts/) for phase-specific implementation guides.

---

## Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

### Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

### Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

### Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
