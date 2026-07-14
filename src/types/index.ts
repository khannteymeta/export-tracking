export type {
  User,
  NewUser,
  Customer,
  NewCustomer,
  AuditLog,
  NewAuditLog,
  SystemSetting,
  NewSystemSetting,
  WebhookLog,
  NewWebhookLog,
  JobLog,
  NewJobLog,
  TelegramChat,
  NewTelegramChat,
  CustomerTelegramChat,
  NewCustomerTelegramChat,
  Tracker,
  NewTracker,
  TrackerStatusHistory,
  NewTrackerStatusHistory,
  TrackerEvent,
  NewTrackerEvent,
  Template,
  NewTemplate,
  ShipmentExport,
  NewShipmentExport,
  ExportGeofence,
  NewExportGeofence,
  ExportBorderEvent,
  NewExportBorderEvent,
} from '../db/schema';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

