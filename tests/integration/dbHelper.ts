import { db } from '@/lib/db';
import {
  users,
  sessions,
  accounts,
  customers,
  trackers,
  trackerEvents,
  trackerStatusHistory,
  telegramChats,
  customerTelegramChats,
  shipmentExports,
  exportBorderEvents,
  webhookLogs,
  jobLogs,
  auditLogs,
  templates,
  systemSettings,
} from '@/db/schema';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Sweeps and deletes all records from all application tables in reverse order of foreign key dependencies.
 */
export async function cleanupDatabase() {
  await db.delete(auditLogs);
  await db.delete(jobLogs);
  await db.delete(webhookLogs);
  await db.delete(exportBorderEvents);
  await db.delete(shipmentExports);
  await db.delete(customerTelegramChats);
  await db.delete(telegramChats);
  await db.delete(trackerStatusHistory);
  await db.delete(trackerEvents);
  await db.delete(trackers);
  await db.delete(templates);
  await db.delete(sessions);
  await db.delete(accounts);
  await db.delete(customers);
  await db.delete(users);
  await db.delete(systemSettings);
}

/**
 * Seeds standard users for roles (Admin, Manager, Viewer) and credentials.
 */
export async function seedInitialData() {
  const adminId = crypto.randomUUID();
  const managerId = crypto.randomUUID();
  const viewerId = crypto.randomUUID();

  const hashedPassword = await bcrypt.hash('password123456', 10);

  // 1. Insert Users
  await db.insert(users).values([
    {
      id: adminId,
      name: 'Integration Admin',
      email: 'admin-test@exporttrack.com',
      role: 'admin',
      emailVerified: true,
    },
    {
      id: managerId,
      name: 'Integration Manager',
      email: 'manager-test@exporttrack.com',
      role: 'manager',
      emailVerified: true,
    },
    {
      id: viewerId,
      name: 'Integration Viewer',
      email: 'viewer-test@exporttrack.com',
      role: 'user', // maps to viewer role in business logic
      emailVerified: true,
    },
  ]);

  // 2. Insert Accounts (Credentials for BetterAuth)
  await db.insert(accounts).values([
    {
      id: crypto.randomUUID(),
      userId: adminId,
      accountId: 'admin-test@exporttrack.com',
      providerId: 'credential',
      password: hashedPassword,
    },
    {
      id: crypto.randomUUID(),
      userId: managerId,
      accountId: 'manager-test@exporttrack.com',
      providerId: 'credential',
      password: hashedPassword,
    },
    {
      id: crypto.randomUUID(),
      userId: viewerId,
      accountId: 'viewer-test@exporttrack.com',
      providerId: 'credential',
      password: hashedPassword,
    },
  ]);

  // 3. Insert system default settings
  await db.insert(systemSettings).values([
    {
      key: 'telegram_bot_token',
      value: '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ',
      description: 'Test telegram bot token',
    },
    {
      key: 'telegram_max_retries',
      value: '3',
      description: 'Maximum delivery retries',
    },
  ]);

  return {
    admin: { id: adminId, email: 'admin-test@exporttrack.com' },
    manager: { id: managerId, email: 'manager-test@exporttrack.com' },
    viewer: { id: viewerId, email: 'viewer-test@exporttrack.com' },
  };
}

/**
 * Inserts a session record for the user and returns the session token.
 */
export async function createTestSession(userId: string): Promise<string> {
  const token = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  await db.insert(sessions).values({
    id: sessionId,
    token,
    userId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return token;
}
