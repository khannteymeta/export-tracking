import { relations } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  text,
  integer,
  numeric,
  doublePrecision,
  timestamp,
  boolean,
  jsonb,
  uuid,
  bigint,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ==========================================
// ENUMS
// ==========================================

export const trackerTypeEnum = pgEnum('tracker_type', ['gps', 'iot_ble', 'rfid_gps']);

export const trackerStatusEnum = pgEnum('tracker_status', ['active', 'idle', 'inactive']);

export const shippingMethodEnum = pgEnum('shipping_method', [
  'sea_freight',
  'air_freight',
  'land_border',
  'courier',
]);

export const shipmentStatusEnum = pgEnum('shipment_status', [
  'pending_export',
  'in_transit',
  'approaching_exit',
  'exited_pending_confirmation',
  'export_confirmed',
  'exception',
]);

export const geofenceTypeEnum = pgEnum('geofence_type', [
  'country_border',
  'port_zone',
  'airport_zone',
  'checkpoint_buffer',
]);

export const borderEventTypeEnum = pgEnum('border_event_type', [
  'entered_buffer',
  'crossed_boundary',
  're_entered',
  'confirmed_exit',
]);

export const borderEventSourceEnum = pgEnum('border_event_source', ['gps', 'manual_admin']);

export const productCategoryEnum = pgEnum('product_category', [
  'electronics',
  'textiles',
  'machinery',
  'agriculture',
  'general',
]);

// ==========================================
// CORE TABLES
// ==========================================

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  role: text('role').default('user').notNull(),
  permissions: jsonb('permissions'),
  isActive: boolean('is_active').default(true).notNull(),
  mustChangePassword: boolean('must_change_password').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').unique(),
  phone: text('phone'),
  address: text('address'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const webhookLogs = pgTable('webhook_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url').notNull(),
  payload: jsonb('payload').notNull(),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const jobLogs = pgTable('job_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobName: text('job_name').notNull(),
  status: text('status').notNull(),
  payload: jsonb('payload'),
  result: jsonb('result'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at').notNull(),
  completedAt: timestamp('completed_at'),
});

export const telegramChats = pgTable('telegram_chats', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: bigint('chat_id', { mode: 'bigint' }).notNull().unique(),
  username: text('username'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  title: text('title'),
  type: text('type').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const customerTelegramChats = pgTable(
  'customer_telegram_chats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    telegramChatId: uuid('telegram_chat_id')
      .notNull()
      .references(() => telegramChats.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('customer_telegram_chat_uniq_idx').on(table.customerId, table.telegramChatId),
  ]
);

// ==========================================
// TRACKER & SHIPMENT TABLES
// ==========================================

export const trackers = pgTable('trackers', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalTrackerId: text('external_tracker_id').notNull().unique(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'restrict' }),
  label: text('label').notNull(),
  trackerType: trackerTypeEnum('tracker_type').notNull(),
  status: trackerStatusEnum('status').default('inactive').notNull(),
  lastSeenAt: timestamp('last_seen_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const trackerStatusHistory = pgTable('tracker_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  trackerId: uuid('tracker_id')
    .notNull()
    .references(() => trackers.id, { onDelete: 'cascade' }),
  previousStatus: trackerStatusEnum('previous_status'),
  newStatus: trackerStatusEnum('new_status').notNull(),
  changedAt: timestamp('changed_at').defaultNow().notNull(),
});

export const trackerEvents = pgTable(
  'tracker_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trackerId: uuid('tracker_id')
      .notNull()
      .references(() => trackers.id, { onDelete: 'cascade' }),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    recordedAt: timestamp('recorded_at').notNull(),
    rawPayload: jsonb('raw_payload').notNull(),
    receivedAt: timestamp('received_at').defaultNow().notNull(),
  },
  (table) => [
    index('tracker_events_tracker_id_idx').on(table.trackerId),
    index('tracker_events_recorded_at_idx').on(table.recordedAt),
    index('tracker_events_tracker_id_recorded_at_idx').on(table.trackerId, table.recordedAt),
  ]
);

export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  content: text('content').notNull(),
  description: text('description'),
});

// ==========================================
// EXPORT SHIPMENT TRACKING TABLES
// ==========================================

export const shipmentExports = pgTable(
  'shipment_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trackerId: uuid('tracker_id')
      .notNull()
      .references(() => trackers.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    productCategory: productCategoryEnum('product_category').notNull(),
    productDescription: text('product_description').notNull(),
    quantity: integer('quantity'),
    weightKg: numeric('weight_kg', { precision: 12, scale: 3 }),
    shipmentReference: text('shipment_reference'),
    containerNumber: text('container_number'),
    destinationCountry: text('destination_country').notNull(),
    shippingMethod: shippingMethodEnum('shipping_method').notNull(),
    status: shipmentStatusEnum('status').default('pending_export').notNull(),
    originLat: doublePrecision('origin_lat').notNull(),
    originLng: doublePrecision('origin_lng').notNull(),
    originCapturedAt: timestamp('origin_captured_at').notNull(),
    expectedExportDate: timestamp('expected_export_date'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('shipment_exports_status_idx').on(table.status),
    index('shipment_exports_tracker_id_idx').on(table.trackerId),
  ]
);

export const exportGeofences = pgTable('export_geofences', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: geofenceTypeEnum('type').notNull(),
  countryCode: text('country_code').notNull(),
  polygon: jsonb('polygon').notNull(),
  bufferMeters: integer('buffer_meters'),
  isActive: boolean('is_active').default(true).notNull(),
});

export const exportBorderEvents = pgTable(
  'export_border_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shipmentExportId: uuid('shipment_export_id')
      .notNull()
      .references(() => shipmentExports.id, { onDelete: 'cascade' }),
    geofenceId: uuid('geofence_id')
      .notNull()
      .references(() => exportGeofences.id, { onDelete: 'restrict' }),
    eventType: borderEventTypeEnum('event_type').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    occurredAt: timestamp('occurred_at').notNull(),
    source: borderEventSourceEnum('source').notNull(),
    confirmedBy: text('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
  },
  (table) => [
    index('export_border_events_shipment_export_id_idx').on(table.shipmentExportId),
  ]
);

// ==========================================
// RELATIONSHIPS
// ==========================================

export const usersRelations = relations(users, ({ many }) => ({
  auditLogs: many(auditLogs),
  shipmentExports: many(shipmentExports),
  confirmedBorderEvents: many(exportBorderEvents),
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  trackers: many(trackers),
  shipmentExports: many(shipmentExports),
  customerTelegramChats: many(customerTelegramChats),
  templates: many(templates),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const telegramChatsRelations = relations(telegramChats, ({ many }) => ({
  customerTelegramChats: many(customerTelegramChats),
}));

export const customerTelegramChatsRelations = relations(customerTelegramChats, ({ one }) => ({
  customer: one(customers, {
    fields: [customerTelegramChats.customerId],
    references: [customers.id],
  }),
  telegramChat: one(telegramChats, {
    fields: [customerTelegramChats.telegramChatId],
    references: [telegramChats.id],
  }),
}));

export const trackersRelations = relations(trackers, ({ one, many }) => ({
  customer: one(customers, {
    fields: [trackers.customerId],
    references: [customers.id],
  }),
  statusHistory: many(trackerStatusHistory),
  events: many(trackerEvents),
  shipmentExports: many(shipmentExports),
}));

export const trackerStatusHistoryRelations = relations(trackerStatusHistory, ({ one }) => ({
  tracker: one(trackers, {
    fields: [trackerStatusHistory.trackerId],
    references: [trackers.id],
  }),
}));

export const trackerEventsRelations = relations(trackerEvents, ({ one }) => ({
  tracker: one(trackers, {
    fields: [trackerEvents.trackerId],
    references: [trackers.id],
  }),
}));

export const templatesRelations = relations(templates, ({ one }) => ({
  customer: one(customers, {
    fields: [templates.customerId],
    references: [customers.id],
  }),
}));

export const shipmentExportsRelations = relations(shipmentExports, ({ one, many }) => ({
  tracker: one(trackers, {
    fields: [shipmentExports.trackerId],
    references: [trackers.id],
  }),
  customer: one(customers, {
    fields: [shipmentExports.customerId],
    references: [customers.id],
  }),
  creator: one(users, {
    fields: [shipmentExports.createdBy],
    references: [users.id],
  }),
  borderEvents: many(exportBorderEvents),
}));

export const exportGeofencesRelations = relations(exportGeofences, ({ many }) => ({
  borderEvents: many(exportBorderEvents),
}));

export const exportBorderEventsRelations = relations(exportBorderEvents, ({ one }) => ({
  shipmentExport: one(shipmentExports, {
    fields: [exportBorderEvents.shipmentExportId],
    references: [shipmentExports.id],
  }),
  geofence: one(exportGeofences, {
    fields: [exportBorderEvents.geofenceId],
    references: [exportGeofences.id],
  }),
  confirmedBy: one(users, {
    fields: [exportBorderEvents.confirmedBy],
    references: [users.id],
  }),
}));

// ==========================================
// TYPE DEFINITIONS
// ==========================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;

export type WebhookLog = typeof webhookLogs.$inferSelect;
export type NewWebhookLog = typeof webhookLogs.$inferInsert;

export type JobLog = typeof jobLogs.$inferSelect;
export type NewJobLog = typeof jobLogs.$inferInsert;

export type TelegramChat = typeof telegramChats.$inferSelect;
export type NewTelegramChat = typeof telegramChats.$inferInsert;

export type CustomerTelegramChat = typeof customerTelegramChats.$inferSelect;
export type NewCustomerTelegramChat = typeof customerTelegramChats.$inferInsert;

export type Tracker = typeof trackers.$inferSelect;
export type NewTracker = typeof trackers.$inferInsert;

export type TrackerStatusHistory = typeof trackerStatusHistory.$inferSelect;
export type NewTrackerStatusHistory = typeof trackerStatusHistory.$inferInsert;

export type TrackerEvent = typeof trackerEvents.$inferSelect;
export type NewTrackerEvent = typeof trackerEvents.$inferInsert;

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;

export type ShipmentExport = typeof shipmentExports.$inferSelect;
export type NewShipmentExport = typeof shipmentExports.$inferInsert;

export type ExportGeofence = typeof exportGeofences.$inferSelect;
export type NewExportGeofence = typeof exportGeofences.$inferInsert;

export type ExportBorderEvent = typeof exportBorderEvents.$inferSelect;
export type NewExportBorderEvent = typeof exportBorderEvents.$inferInsert;
