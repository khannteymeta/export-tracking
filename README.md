# ExportTrack Portal

ExportTrack Portal is a modern, real-time cargo monitoring and export control platform designed to trace, verify, and confirm product shipments exiting national borders, ports of exit, and customs buffer zones.

---

## 1. Project Overview

ExportTrack integrates real-time IoT GPS telemetry, customizable geofencing, and automated status alerts to secure compliance audits and tax-exemption verification for exporting corporations:
*   **Geofence Enforcement**: Auto-confirms exits with a configurable debounce logic and alerts ops teams on illegal re-entries or custom holds.
*   **Telegram Integration**: Instantly links customer Telegram chats and broadcasts border alerts to shipper logs.
*   **Analytics Dashboard**: Visualizes cargo distribution, hourly device updates, system health diagnostic pings, and average export durations.

---

## 2. Technology Stack

*   **Framework**: [Next.js](https://nextjs.org/) (App Router) + TypeScript
*   **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
*   **Database**: PostgreSQL
*   **Caching & Background Queues**: Redis + [BullMQ](https://bullmq.io/)
*   **Authentication**: [BetterAuth](https://better-auth.com/)
*   **Bot API Framework**: [Grammy.dev](https://grammy.dev/)
*   **Testing**: [Vitest](https://vitest.dev/)

---

## 3. Quick Start Guide

### Prerequisites
*   Node.js v20+ or Bun v1.1.18+ (Recommended)
*   PostgreSQL running database instance
*   Redis server instance

### Installation
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/username/exporttrack-portal.git
    cd exporttrack-portal
    ```
2.  **Install dependencies**:
    ```bash
    bun install
    # or: npm install
    ```
3.  **Setup Environment**:
    Copy `.env.example` to `.env` and fill in your connection secrets:
    ```bash
    cp .env.example .env
    ```
4.  **Database Migration & Seeding**:
    ```bash
    bun db:migrate
    bun db:seed
    ```
5.  **Start Development Server**:
    ```bash
    bun dev
    ```
    Open `http://localhost:3000` to view the portal.

---

## 4. Project Directory Structure

```text
├── src/
│   ├── app/                    # Next.js App Router (pages and API endpoints)
│   │   ├── api/                # REST HTTP Controllers (Auth, Customers, Webhooks, etc.)
│   │   └── page.tsx            # Portal Client Interfaces
│   ├── db/                     # DB schemas and migrations configuration
│   │   ├── schema.ts           # Drizzle table declarations (users, shipments, geofences)
│   │   └── migrations/         # Auto-generated SQL schema migrations
│   ├── lib/                    # Shared core helpers (auth filters, errors, database instances)
│   └── server/                 # Backend Business Logic and Service Layer
│       ├── services/           # Services (CustomerService, ExportGeofenceService, etc.)
│       ├── jobs/               # Background task queues and BullMQ workers
│       └── webhooks/           # Webhook payload schemas and security filters
├── tests/                      # Testing suites
│   └── integration/            # REST API route integration tests (Postgres tests)
└── docs/                       # Project manuals & guides (API, Deployment, Export Tracking)
```

---

## 5. Development Workflow

### Testing
We use Vitest for both Unit and Integration testing. Integration tests execute against a real PostgreSQL database to guarantee database constraint validity:
```bash
# Run all tests
bun test

# Run integration tests only
bunx vitest run tests/integration/api.test.ts
```

### Formatting and Linting
```bash
bun run lint
bun run format
```

---

## 6. Contributing Guidelines

1.  Create a feature branch from `main` (e.g. `feat/geofence-import`).
2.  Commit changes utilizing concise, clear commit messages.
3.  Add unit or integration tests for any new endpoints or service methods.
4.  Submit a Pull Request and verify that all automated integration checks are passing.

---

## 7. License

This project is licensed under the MIT License - see the `LICENSE` file for details.
