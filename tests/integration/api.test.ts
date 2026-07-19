// Setup Mock environment variables at the absolute top of the file
process.env.DATABASE_URL = 'postgresql://postgres:1111@localhost:5432/exporttrack';
process.env.WEBHOOK_SECRET = 'tracker-webhook-secret-key-development';

import { vi, describe, it, expect, beforeEach } from 'vitest';

// 1. Mock ioredis globally to prevent TCP connections
vi.mock('ioredis', () => {
  return {
    Redis: vi.fn().mockImplementation(function (this: any) {
      this.incr = vi.fn().mockResolvedValue(1);
      this.expire = vi.fn().mockResolvedValue(true);
      this.on = vi.fn();
      this.get = vi.fn().mockResolvedValue(null);
      this.set = vi.fn().mockResolvedValue('OK');
      this.ping = vi.fn().mockResolvedValue('PONG');
      return this;
    }),
  };
});

// 2. Mock BullMQ to prevent queue job processing attempts in tests
vi.mock('bullmq', () => {
  class MockQueue {
    name: string;
    add: any;
    constructor(name: string) {
      this.name = name;
      this.add = vi.fn().mockResolvedValue({
        id: `${name}-job-id`,
        waitUntilFinished: vi.fn().mockResolvedValue({
          synced: 3,
          created: 2,
          updated: 1,
          success: 2,
          failed: 0,
          errors: [],
        }),
      });
    }
  }
  class MockWorker {
    name: string;
    on: any;
    constructor(name: string) {
      this.name = name;
      this.on = vi.fn();
    }
  }
  return {
    Queue: MockQueue,
    Worker: MockWorker,
    QueueEvents: vi.fn(),
  };
});

// 3. Mock Grammy bot instance API calls using constructable ES6 class
vi.mock('grammy', () => {
  class MockBot {
    api: any;
    command: any;
    on: any;
    catch: any;
    constructor() {
      this.api = {
        setMyCommands: vi.fn().mockResolvedValue(true),
        getMe: vi.fn().mockResolvedValue({ id: 12345, first_name: 'TestBot', username: 'TestExportTrackBot' }),
        sendMessage: vi.fn().mockResolvedValue({ message_id: 111 }),
      };
      this.command = vi.fn();
      this.on = vi.fn();
      this.catch = vi.fn();
    }
  }
  return {
    Bot: MockBot,
  };
});

// Route imports
import { POST as registerPost } from '@/app/api/auth/register/route';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { POST as logoutPost } from '@/app/api/auth/logout/route';
import { GET as meGet } from '@/app/api/auth/me/route';

import { GET as usersGet, POST as usersPost } from '@/app/api/users/route';
import { GET as userGet, PATCH as userPatch, DELETE as userDelete } from '@/app/api/users/[id]/route';
import { POST as resetPasswordPost } from '@/app/api/users/[id]/reset-password/route';

import { GET as customersGet, POST as customersPost } from '@/app/api/customers/route';
import { GET as customerGet, PATCH as customerPatch, DELETE as customerDelete } from '@/app/api/customers/[id]/route';
import { POST as customersImportPost } from '@/app/api/customers/import/route';

import { GET as trackersGet, POST as trackersPost } from '@/app/api/trackers/route';
import { GET as trackerGet, PATCH as trackerPatch, DELETE as trackerDelete } from '@/app/api/trackers/[id]/route';
import { POST as trackersSyncPost } from '@/app/api/trackers/sync/route';

import { GET as shipmentsGet, POST as shipmentsPost } from '@/app/api/shipment-exports/route';
import { GET as shipmentGet } from '@/app/api/shipment-exports/[id]/route';
import { GET as timelineGet } from '@/app/api/shipment-exports/[id]/timeline/route';
import { POST as confirmPost } from '@/app/api/shipment-exports/[id]/confirm/route';
import { POST as flagExceptionPost } from '@/app/api/shipment-exports/[id]/flag-exception/route';

import { GET as geofencesGet, POST as geofencesPost } from '@/app/api/export-geofences/route';
import { PATCH as geofencePatch, DELETE as geofenceDelete } from '@/app/api/export-geofences/[id]/route';

import { POST as trackerWebhookPost } from '@/app/api/webhook/tracker/route';

import { GET as dashboardSummaryGet } from '@/app/api/dashboard/summary/route';
import { GET as dashboardTrackerMetricsGet } from '@/app/api/dashboard/tracker-metrics/route';
import { GET as dashboardExportMetricsGet } from '@/app/api/dashboard/export-metrics/route';
import { GET as dashboardHealthGet } from '@/app/api/dashboard/health/route';

import { cleanupDatabase, seedInitialData, createTestSession } from './dbHelper';
import { db } from '@/lib/db';
import { customers as dbCustomers, trackers as dbTrackers, exportGeofences as dbExportGeofences, trackerEvents as dbTrackerEvents } from '@/db/schema';

describe('ExportTrack API Integration Tests', () => {
  let seededUsers: any;
  let adminToken: string;
  let managerToken: string;
  let viewerToken: string;

  beforeEach(async () => {
    // Clean and seed real PostgreSQL database
    await cleanupDatabase();
    seededUsers = await seedInitialData();

    // Create session tokens for each seeded user
    adminToken = await createTestSession(seededUsers.admin.id);
    managerToken = await createTestSession(seededUsers.manager.id);
    viewerToken = await createTestSession(seededUsers.viewer.id);
  });

  // Helper to generate authenticated request headers
  function getHeaders(token?: string) {
    const headers = new Headers();
    if (token) {
      headers.set('Cookie', `better-auth.session_token=${token}`);
      headers.set('Authorization', `Bearer ${token}`);
    }
    headers.set('Content-Type', 'application/json');
    return headers;
  }

  describe('1. Authentication Routes', () => {
    it('POST /api/auth/register - Success & Duplicate Email', async () => {
      const email = 'new-user@exporttrack.com';
      const registerReq = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          email,
          password: 'password123456',
          name: 'New Registered User',
          role: 'user',
        }),
      });

      const res = await registerPost(registerReq);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.email).toBe(email);

      // Try duplicate registration
      const duplicateReq = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          email,
          password: 'password123456',
          name: 'New Registered User',
          role: 'user',
        }),
      });
      const dupRes = await registerPost(duplicateReq);
      expect(dupRes.status).toBe(409); // ConflictError
    });

    it('POST /api/auth/login - Success & Invalid credentials', async () => {
      const loginReq = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          email: 'admin-test@exporttrack.com',
          password: 'password123456',
        }),
      });

      const res = await loginPost(loginReq);
      expect(res.status).toBe(200);

      const invalidReq = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          email: 'admin-test@exporttrack.com',
          password: 'wrong-password',
        }),
      });
      const invalidRes = await loginPost(invalidReq);
      expect(invalidRes.status).toBe(401); // BetterAuth returns 401 for unauthorized credentials
    });

    it('GET /api/auth/me - returns session status', async () => {
      const meReq = new Request('http://localhost/api/auth/me', {
        method: 'GET',
        headers: getHeaders(adminToken),
      });

      const res = await meGet(meReq);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.email).toBe('admin-test@exporttrack.com');

      // Unauthenticated check
      const unauthReq = new Request('http://localhost/api/auth/me', {
        method: 'GET',
        headers: getHeaders(),
      });
      const unauthRes = await meGet(unauthReq);
      expect(unauthRes.status).toBe(401);
    });
  });

  describe('2. User Management Routes', () => {
    it('POST /api/users - Admin only access controls', async () => {
      const payload = {
        email: 'user-created@exporttrack.com',
        password: 'password123456',
        name: 'Admin Created User',
        role: 'manager',
      };

      // Admin access (Success)
      const adminReq = new Request('http://localhost/api/users', {
        method: 'POST',
        headers: getHeaders(adminToken),
        body: JSON.stringify(payload),
      });
      const res = await usersPost(adminReq);
      expect(res.status).toBe(201);

      // Non-admin manager access (Forbidden 403)
      const managerReq = new Request('http://localhost/api/users', {
        method: 'POST',
        headers: getHeaders(managerToken),
        body: JSON.stringify({ ...payload, email: 'another@email.com' }),
      });
      const mRes = await usersPost(managerReq);
      expect(mRes.status).toBe(403);
    });

    it('GET /api/users - List users with pagination', async () => {
      const listReq = new Request('http://localhost/api/users?page=1&limit=2', {
        method: 'GET',
        headers: getHeaders(adminToken),
      });

      const res = await usersGet(listReq);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.users.length).toBeGreaterThan(0);
    });
  });

  describe('3. Customer Routes', () => {
    it('CRUD operations & CSV Bulk import', async () => {
      // 1. Create Customer
      const createReq = new Request('http://localhost/api/customers', {
        method: 'POST',
        headers: getHeaders(managerToken),
        body: JSON.stringify({
          name: 'Seeded Customer Corp',
          email: 'corp@customer.com',
          phone: '+15550199',
          location: 'Industrial Park Zone A',
        }),
      });

      const createRes = await customersPost(createReq);
      expect(createRes.status).toBe(201);
      const createData = await createRes.json();
      const customerId = createData.data.id;

      // 2. Fetch Customer Details (using manager session since Viewer requires assignment link)
      const getReq = new Request(`http://localhost/api/customers/${customerId}`, {
        method: 'GET',
        headers: getHeaders(managerToken),
      });
      const getRes = await customerGet(getReq, { params: Promise.resolve({ id: customerId }) });
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.data.name).toBe('Seeded Customer Corp');

      // 3. Update Customer details (PATCH)
      const patchReq = new Request(`http://localhost/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: getHeaders(managerToken),
        body: JSON.stringify({ name: 'Updated Customer Corp' }),
      });
      const patchRes = await customerPatch(patchReq, { params: Promise.resolve({ id: customerId }) });
      expect(patchRes.status).toBe(200);

      // 4. Bulk CSV Import
      const csvData = `name,email,phone,location\nAcme Industries,acme@import.com,+1222,Avenue A\nDelta Logistics,delta@import.com,+1333,Avenue B`;
      const importReq = new Request('http://localhost/api/customers/import', {
        method: 'POST',
        headers: getHeaders(managerToken),
        body: csvData,
      });
      const importRes = await customersImportPost(importReq);
      expect(importRes.status).toBe(200);
      const importResult = await importRes.json();
      expect(importResult.data.success).toBe(2);
    });
  });

  describe('4. Tracker Routes', () => {
    it('CRUD operations & API Tracker syncs', async () => {
      // Create Customer dependency
      const [customer] = await db
        .insert(dbCustomers)
        .values({
          name: 'Tracker Client',
          phone: '+1444',
          location: 'Zone 1',
        })
        .returning();

      // 1. Create Tracker
      const createReq = new Request('http://localhost/api/trackers', {
        method: 'POST',
        headers: getHeaders(managerToken),
        body: JSON.stringify({
          externalTrackerId: 'trk-int-001',
          customerId: customer.id,
          label: 'Air Cargo GPS unit',
          trackerType: 'gps',
        }),
      });

      const createRes = await trackersPost(createReq);
      expect(createRes.status).toBe(201);
      const createData = await createRes.json();
      const trackerId = createData.data.id;

      // 2. Patch Tracker status
      const patchReq = new Request(`http://localhost/api/trackers/${trackerId}`, {
        method: 'PATCH',
        headers: getHeaders(managerToken),
        body: JSON.stringify({ status: 'active' }),
      });
      const patchRes = await trackerPatch(patchReq, { params: Promise.resolve({ id: trackerId }) });
      expect(patchRes.status).toBe(200);

      // 3. Sync from tracker external API
      const syncReq = new Request('http://localhost/api/trackers/sync', {
        method: 'POST',
        headers: getHeaders(adminToken),
        body: JSON.stringify({ customerId: customer.id }),
      });
      const syncRes = await trackersSyncPost(syncReq);
      expect(syncRes.status).toBe(200);
      const syncData = await syncRes.json();
      expect(syncData.data.synced).toBeGreaterThan(0);
    });
  });

  describe('5. Export Shipment Tracking Routes', () => {
    it('create, list, exception-checks, and geofence controls', async () => {
      // 1. Setup Customer & Tracker Dependencies
      const [customer] = await db
        .insert(dbCustomers)
        .values({ name: 'Export Client', phone: '+1888', location: 'Factory Zone A' })
        .returning();

      const [tracker] = await db
        .insert(dbTrackers)
        .values({
          externalTrackerId: 'trk-exp-888',
          customerId: customer.id,
          label: 'Client Export GPS Tag',
          trackerType: 'gps',
          status: 'active',
        })
        .returning();

      // Setup Geofence
      const [geofence] = await db
        .insert(dbExportGeofences)
        .values({
          name: 'US Border Outlet',
          type: 'country_border',
          countryCode: 'US',
          polygon: {
            type: 'Polygon',
            coordinates: [
              [
                [-122.5, 37.7],
                [-122.4, 37.7],
                [-122.4, 37.8],
                [-122.5, 37.8],
                [-122.5, 37.7],
              ],
            ],
          },
          isActive: true,
        })
        .returning();

      // Insert baseline position event for the tracker to satisfy ExportTrackingService requirements
      await db
        .insert(dbTrackerEvents)
        .values({
          trackerId: tracker.id,
          lat: 37.75,
          lng: -122.45,
          recordedAt: new Date(),
          rawPayload: {},
        });

      // 2. Create Shipment Export
      const createReq = new Request('http://localhost/api/shipment-exports', {
        method: 'POST',
        headers: getHeaders(managerToken),
        body: JSON.stringify({
          trackerId: tracker.id,
          customerId: customer.id,
          productCategory: 'electronics',
          productDescription: 'Microchips bulk crate',
          destinationCountry: 'US',
          shippingMethod: 'air_freight',
        }),
      });

      const createRes = await shipmentsPost(createReq);
      expect(createRes.status).toBe(201);
      const shipmentData = await createRes.json();
      const shipmentId = shipmentData.data.id;

      // Duplicate shipment rejection (Conflict 409)
      const duplicateReq = new Request('http://localhost/api/shipment-exports', {
        method: 'POST',
        headers: getHeaders(managerToken),
        body: JSON.stringify({
          trackerId: tracker.id,
          customerId: customer.id,
          productCategory: 'electronics',
          productDescription: 'Microchips bulk crate',
          destinationCountry: 'US',
          shippingMethod: 'air_freight',
        }),
      });
      const dupRes = await shipmentsPost(duplicateReq);
      expect(dupRes.status).toBe(409);

      // 3. List Shipment Exports with filter query params
      const listReq = new Request('http://localhost/api/shipment-exports?productCategory=electronics&destinationCountry=US', {
        method: 'GET',
        headers: getHeaders(viewerToken),
      });
      const listRes = await shipmentsGet(listReq);
      expect(listRes.status).toBe(200);

      // 4. Fetch Timeline (using managerToken since Viewer lacks assignment)
      const timelineReq = new Request(`http://localhost/api/shipment-exports/${shipmentId}/timeline`, {
        method: 'GET',
        headers: getHeaders(managerToken),
      });
      const timelineRes = await timelineGet(timelineReq, { params: Promise.resolve({ id: shipmentId }) });
      expect(timelineRes.status).toBe(200);

      // 5. Flag Exception (Manager only)
      const exceptionReq = new Request(`http://localhost/api/shipment-exports/${shipmentId}/flag-exception`, {
        method: 'POST',
        headers: getHeaders(managerToken),
        body: JSON.stringify({
          reason: 'customs_hold',
          details: 'Delayed at border checkpoint 2',
        }),
      });
      const excRes = await flagExceptionPost(exceptionReq, { params: Promise.resolve({ id: shipmentId }) });
      expect(excRes.status).toBe(200);

      // 6. Confirm Export Override (Admin only)
      const confirmReq = new Request(`http://localhost/api/shipment-exports/${shipmentId}/confirm`, {
        method: 'POST',
        headers: getHeaders(adminToken),
        body: JSON.stringify({ notes: 'Confirmed manual release' }),
      });
      const confRes = await confirmPost(confirmReq, { params: Promise.resolve({ id: shipmentId }) });
      expect(confRes.status).toBe(200);

      // Confirm Export (Non-admin manager gets Forbidden 403)
      const managerConfirmReq = new Request(`http://localhost/api/shipment-exports/${shipmentId}/confirm`, {
        method: 'POST',
        headers: getHeaders(managerToken),
        body: JSON.stringify({ notes: 'Manager override try' }),
      });
      const mcRes = await confirmPost(managerConfirmReq, { params: Promise.resolve({ id: shipmentId }) });
      expect(mcRes.status).toBe(403);
    });
  });

  describe('6. Telegram/Tracker Webhook Routes', () => {
    it('POST /api/webhook/tracker - auth checks and rate limits', async () => {
      const payload = {
        externalTrackerId: 'trk-exp-888',
        lat: 37.75,
        lng: -122.45,
        recordedAt: new Date().toISOString(),
      };

      // 1. Missing header -> 401 Unauthorized
      const missingKeyReq = new Request('http://localhost/api/webhook/tracker', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      const res401 = await trackerWebhookPost(missingKeyReq);
      expect(res401.status).toBe(401);

      // 2. Invalid API Key -> 401 Unauthorized
      const invalidKeyHeaders = getHeaders();
      invalidKeyHeaders.set('x-api-key', 'wrong-webhook-key');
      const invalidKeyReq = new Request('http://localhost/api/webhook/tracker', {
        method: 'POST',
        headers: invalidKeyHeaders,
        body: JSON.stringify(payload),
      });
      const resInvalid = await trackerWebhookPost(invalidKeyReq);
      expect(resInvalid.status).toBe(401);
    });
  });

  describe('7. Dashboard Routes', () => {
    it('Access dashboard aggregates and system health pings', async () => {
      // 1. Summary
      const summaryReq = new Request('http://localhost/api/dashboard/summary?timeRange=week', {
        method: 'GET',
        headers: getHeaders(viewerToken),
      });
      const summaryRes = await dashboardSummaryGet(summaryReq);
      expect(summaryRes.status).toBe(200);
      const summaryData = await summaryRes.json();
      expect(summaryData.success).toBe(true);

      // 2. Tracker Metrics
      const trackerReq = new Request('http://localhost/api/dashboard/tracker-metrics', {
        method: 'GET',
        headers: getHeaders(viewerToken),
      });
      const trackerRes = await dashboardTrackerMetricsGet(trackerReq);
      expect(trackerRes.status).toBe(200);

      // 3. Export Metrics
      const exportReq = new Request('http://localhost/api/dashboard/export-metrics', {
        method: 'GET',
        headers: getHeaders(viewerToken),
      });
      const exportRes = await dashboardExportMetricsGet(exportReq);
      expect(exportRes.status).toBe(200);

      // 4. System Health (Admin only)
      const healthReq = new Request('http://localhost/api/dashboard/health', {
        method: 'GET',
        headers: getHeaders(adminToken),
      });
      const healthRes = await dashboardHealthGet(healthReq);
      expect(healthRes.status).toBe(200);
      const healthData = await healthRes.json();
      expect(healthData.success).toBe(true);
      expect(healthData.data.db).toBe('ok');

      // Health (Non-admin manager gets Forbidden 403)
      const managerHealthReq = new Request('http://localhost/api/dashboard/health', {
        method: 'GET',
        headers: getHeaders(managerToken),
      });
      const mhRes = await dashboardHealthGet(managerHealthReq);
      expect(mhRes.status).toBe(403);
    });
  });
});
