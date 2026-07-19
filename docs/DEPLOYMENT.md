# Production Deployment Guide

This guide details steps required to deploy the ExportTrack Cargo Portal to staging and production environments.

---

## 1. Prerequisites

The portal requires the following minimum system resources:
*   **Runtime Environment**: Node.js v20+ or Bun v1.1.18+ (Recommended)
*   **Database**: PostgreSQL v15+ (with support for standard index aggregates)
*   **Cache & Queue Broker**: Redis v6.2+
*   **Process Manager**: PM2 or Docker Compose (if not using serverless hosting)

---

## 2. Environment Variables

Create a `.env` file in the project root containing the following configurations:

```ini
# Application URLs
NEXT_PUBLIC_APP_URL="https://portal.exporttrack.com"
BETTER_AUTH_URL="https://portal.exporttrack.com"

# Databases & Cache Broker URLs
DATABASE_URL="postgresql://postgres:password@db-host:5432/exporttrack"
REDIS_URL="redis://:redis-password@redis-host:6379"

# Security & Secrets Keys
BETTER_AUTH_SECRET="secure-auth-secret-32-chars-long"
WEBHOOK_SECRET="secure-external-api-key-for-trackers"

# Telegram Grammy Integration Bot Configurations
TELEGRAM_BOT_TOKEN="1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ"
TELEGRAM_WEBHOOK_URL="https://portal.exporttrack.com/api/webhook/telegram"

# External IoT Tracker API
TRACKER_API_BASE_URL="https://api.external-trackers.com/v1"
TRACKER_API_KEY="external-gps-provider-api-token"
```

---

## 3. Database Initial Setup

1.  **Create Database**: Create your target database in your PostgreSQL instance.
    ```bash
    createdb -h localhost -U postgres exporttrack
    ```
2.  **Run Migrations**: Apply migrations to create schemas, indexes, and tables.
    ```bash
    bun db:migrate
    # or: npm run db:migrate
    ```
3.  **Seed Default Records**: Insert default user roles (`admin`, `manager`, `user`), baseline geofences, and config settings.
    ```bash
    bun db:seed
    # or: npm run db:seed
    ```

---

## 4. Telegram Bot Hook Registration

The system uses webhook routing to receive my_chat_member bot joins and commands from Telegram:

1.  **Create Telegram Bot**: Use Telegram's [@BotFather](https://t.me/BotFather) client.
    *   Send command `/newbot` and follow prompt instructions.
    *   Record the returned `TELEGRAM_BOT_TOKEN` in your environment config.
2.  **Enable Webhooks**: Bind your deployment endpoint URL to Telegram's gateway:
    ```bash
    curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
         -H "Content-Type: application/json" \
         -d '{"url": "https://portal.exporttrack.com/api/webhook/telegram"}'
    ```
3.  **Verify webhook registration**:
    ```bash
    curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
    ```

---

## 5. Loading Production Geofences

The baseline seed file includes synthetic coordinates. To load real-world customs zones, ports of exit, or national borders:

1.  Export your border borders as standard GeoJSON `Polygon` format from GIS tools (e.g. QGIS or [geojson.io](https://geojson.io)).
2.  Import them using the admin dashboard settings portal or insert them directly via SQL command:
    ```sql
    INSERT INTO export_geofences (name, type, country_code, polygon, is_active)
    VALUES (
      'Rotterdam Seaport Exit Gate',
      'port_zone',
      'NL',
      '{"type": "Polygon", "coordinates": [[[4.0, 51.9], [4.1, 51.9], [4.1, 52.0], [4.0, 52.0], [4.0, 51.9]]]}',
      true
    );
    ```

---

## 6. Hosting Platforms Deployment

### Vercel / Netlify (Serverless Next.js App)
1.  Connect your GitHub repository to Vercel.
2.  Configure all environment variables in Vercel project settings dashboard.
3.  Deploy. Vercel automatically deploys Next.js pages and API route handlers as Serverless/Edge functions.
*Note: Ensure your PostgreSQL and Redis connections permit serverless connection pools.*

### DigitalOcean / AWS (VPS Server VM)
1.  Clone the codebase to your VPS.
2.  Run `bun install` or `npm install` and build:
    ```bash
    bun run build
    ```
3.  Start Background Worker tasks (BullMQ workers) using a process manager:
    ```bash
    pm2 start ecosystem.config.js
    ```
4.  Configure Nginx reverse proxy to forward traffic to `http://localhost:3000`.

---

## 7. Diagnostics & Monitoring Health

1.  **Telemetry Endpoint**: Set up external uptime pings (e.g., UptimeRobot, Datadog) pointing to `/api/dashboard/health` (requires admin auth) or `/api/dashboard/summary`.
2.  **Server Logs**: Check backend logs using PM2:
    ```bash
    pm2 logs exporttrack
    ```
3.  **Active Connections**: Monitor Redis queues using `redis-cli monitor`.

---

## 8. Rollback Procedure

If a deployment introduces regressions:
1.  **Code Rollback**: Revert Git main branch or select previous deployment build hash on Vercel dashboard and click "Redeploy".
2.  **Database Rollback**: If migration changes were applied, execute the downgrade query or restore the PostgreSQL backup:
    ```bash
    pg_restore -d exporttrack backup.dump
    ```
3.  **Worker Restart**: PM2 reload command:
    ```bash
    pm2 reload all --update-env
    ```
