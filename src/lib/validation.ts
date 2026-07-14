import { z, ZodSchema } from 'zod';

// ============================================================================
// HELPER TYPES & FUNCTIONS
// ============================================================================

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: Record<string, string[]> };

/**
 * Validates input data against a given Zod schema.
 * Returns a Result object with type-safe data or structured errors.
 */
export function validateInput<T>(schema: ZodSchema<T>, data: unknown): Result<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors = result.error.flatten().fieldErrors;
  const errorMap: Record<string, string[]> = {};

  for (const key in fieldErrors) {
    if (fieldErrors[key]) {
      errorMap[key] = fieldErrors[key]!;
    }
  }

  const formErrors = result.error.flatten().formErrors;
  if (formErrors.length > 0) {
    errorMap._form = formErrors;
  }

  return { success: false, error: errorMap };
}

// ============================================================================
// 1. AUTHENTICATION SCHEMAS
// ============================================================================

export const registerSchema = z.object({
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  password: z.string().min(12, 'Password must be at least 12 characters long'),
  name: z.string().min(1, 'Name is required').trim(),
  role: z.enum(['admin', 'manager', 'user']).default('user'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email address').trim().toLowerCase(),
});

// Inferred Types
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ============================================================================
// 2. USERS SCHEMAS
// ============================================================================

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  password: z.string().min(12, 'Password must be at least 12 characters long'),
  name: z.string().min(1, 'Name is required').trim(),
  role: z.enum(['admin', 'manager', 'user']).default('user'),
});

export const updateUserSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').trim().optional(),
  role: z.enum(['admin', 'manager', 'user']).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(12, 'New password must be at least 12 characters long'),
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: 'New password must be different from current password',
  path: ['newPassword'],
});

// Inferred Types
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ============================================================================
// 3. CUSTOMERS SCHEMAS (Shippers/Exporters)
// ============================================================================

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required').trim(),
  email: z.string().email('Invalid email address').trim().toLowerCase().optional().or(z.literal('')),
  phone: z.string().min(1, 'Phone number is required').trim(),
  location: z.string().min(1, 'Location is required').trim(), // maps to DB address
});

export const updateCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name cannot be empty').trim().optional(),
  email: z.string().email('Invalid email address').trim().toLowerCase().optional().or(z.literal('')),
  phone: z.string().min(1, 'Phone number cannot be empty').trim().optional(),
  location: z.string().min(1, 'Location cannot be empty').trim().optional(),
});

// CSV Raw Row Validation
export const customerImportRowSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  email: z.string().email('Invalid email').trim().toLowerCase().optional().or(z.literal('')),
  phone: z.string().optional(),
  location: z.string().optional(),
});

// Validate array parsed from CSV
export const importCustomersSchema = z.array(customerImportRowSchema);

// File validation schema for CSV upload
export const csvFileSchema = z.custom<File>((val) => val instanceof File, 'Must be a File object')
  .refine((file) => file.name.endsWith('.csv'), 'Only CSV files are allowed')
  .refine((file) => file.size <= 5 * 1024 * 1024, 'File size must be under 5MB');

// Inferred Types
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerImportRow = z.infer<typeof customerImportRowSchema>;
export type ImportCustomersInput = z.infer<typeof importCustomersSchema>;

// ============================================================================
// 4. TRACKERS SCHEMAS
// ============================================================================

export const createTrackerSchema = z.object({
  externalTrackerId: z.string().min(1, 'External tracker ID is required').trim(),
  customerId: z.string().uuid('Invalid customer ID'),
  label: z.string().min(1, 'Tracker label is required').trim(),
  trackerType: z.enum(['gps', 'iot_ble', 'rfid_gps']),
});

export const updateTrackerSchema = z.object({
  label: z.string().min(1, 'Tracker label cannot be empty').trim().optional(),
  status: z.enum(['active', 'idle', 'inactive']).optional(),
});

// Inferred Types
export type CreateTrackerInput = z.infer<typeof createTrackerSchema>;
export type UpdateTrackerInput = z.infer<typeof updateTrackerSchema>;

// ============================================================================
// 5. TEMPLATES SCHEMAS
// ============================================================================

// Helper to validate that variables in content match only `{varName}` format
const validateTemplateVariables = (content: string) => {
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) return false;

  // Find all structures like {varName} or { malformed }
  const matches = content.match(/\{[^}]*\}/g) || [];
  for (const match of matches) {
    const varName = match.slice(1, -1);
    // Variable name must be alphanumeric and underscore only, starting with letter or underscore
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(varName)) {
      return false;
    }
  }
  return true;
};

const templateVariableErrorMessage = 
  'Template variables must strictly follow the {varName} format using only alphanumeric characters and underscores.';

export const createTemplateSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  name: z.string().min(1, 'Template name is required').trim(),
  content: z.string().min(1, 'Template content is required')
    .refine(validateTemplateVariables, { message: templateVariableErrorMessage }),
  description: z.string().trim().optional(),
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1, 'Template name cannot be empty').trim().optional(),
  content: z.string().min(1, 'Template content cannot be empty')
    .refine(validateTemplateVariables, { message: templateVariableErrorMessage })
    .optional(),
  description: z.string().trim().optional(),
});

// Inferred Types
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

// ============================================================================
// 6. TRACKER EVENTS (Internal Webhook)
// ============================================================================

export const trackerWebhookSchema = z.object({
  externalTrackerId: z.string().min(1, 'External tracker ID is required').trim(),
  lat: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
  lng: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
  recordedAt: z.preprocess((val) => {
    if (typeof val === 'string' || val instanceof Date) return new Date(val);
    return val;
  }, z.date({ message: 'Timestamp is required' })),
  raw: z.record(z.string(), z.unknown()).default({}),
});

// Inferred Types
export type TrackerWebhookInput = z.infer<typeof trackerWebhookSchema>;

// ============================================================================
// 7. EXPORT SHIPMENT TRACKING SCHEMAS
// ============================================================================

export const createShipmentExportSchema = z.object({
  trackerId: z.string().uuid('Invalid tracker ID'),
  customerId: z.string().uuid('Invalid customer ID'),
  productCategory: z.enum(['electronics', 'textiles', 'machinery', 'agriculture', 'general']),
  productDescription: z.string().min(1, 'Product description is required').trim(),
  quantity: z.number().int().positive('Quantity must be a positive integer').optional(),
  weightKg: z.number().positive('Weight must be positive').optional(),
  shipmentReference: z.string().trim().optional(),
  containerNumber: z.string().trim().optional(),
  destinationCountry: z.string().min(1, 'Destination country is required').trim(),
  shippingMethod: z.enum(['sea_freight', 'air_freight', 'land_border', 'courier']),
  expectedExportDate: z.preprocess((val) => {
    if (typeof val === 'string' && val.trim() !== '') return new Date(val);
    if (val instanceof Date) return val;
    return undefined;
  }, z.date().optional()),
});

export const confirmExportSchema = z.object({
  notes: z.string().trim().optional(),
});

// Exception reasons enum with strict details check for 'other'
export const flagExceptionSchema = z.object({
  reason: z.enum([
    'delayed',
    'route_deviation',
    'geofence_exit_missing',
    'signal_loss',
    'customs_hold',
    'damaged',
    'other',
  ]),
  details: z.string().trim().optional(),
}).refine((data) => {
  if (data.reason === 'other') {
    return !!data.details && data.details.trim().length > 0;
  }
  return true;
}, {
  message: "Details are required when the exception reason is 'other'",
  path: ['details'],
});

// GeoJSON Polygon Validation Schemas
const positionSchema = z.array(z.number()).length(2).refine((coord) => {
  const [lng, lat] = coord;
  return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}, 'Coordinates must be valid [longitude, latitude]');

const linearRingSchema = z.array(positionSchema).min(4).refine((ring) => {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}, 'The first and last positions in a LinearRing must be equivalent to close the loop');

export const geoJsonPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(linearRingSchema).min(1),
});

export const createExportGeofenceSchema = z.object({
  name: z.string().min(1, 'Geofence name is required').trim(),
  type: z.enum(['country_border', 'port_zone', 'airport_zone', 'checkpoint_buffer']),
  countryCode: z.string().min(2, 'Country code must be at least 2 characters').max(3).toUpperCase().trim(),
  polygon: geoJsonPolygonSchema,
  bufferMeters: z.number().int().nonnegative('Buffer cannot be negative').optional(),
});

export const updateExportGeofenceSchema = z.object({
  name: z.string().min(1, 'Geofence name cannot be empty').trim().optional(),
  type: z.enum(['country_border', 'port_zone', 'airport_zone', 'checkpoint_buffer']).optional(),
  countryCode: z.string().min(2).max(3).toUpperCase().trim().optional(),
  polygon: geoJsonPolygonSchema.optional(),
  bufferMeters: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

// Inferred Types
export type CreateShipmentExportInput = z.infer<typeof createShipmentExportSchema>;
export type ConfirmExportInput = z.infer<typeof confirmExportSchema>;
export type FlagExceptionInput = z.infer<typeof flagExceptionSchema>;
export type GeoJsonPolygon = z.infer<typeof geoJsonPolygonSchema>;
export type CreateExportGeofenceInput = z.infer<typeof createExportGeofenceSchema>;
export type UpdateExportGeofenceInput = z.infer<typeof updateExportGeofenceSchema>;

// ============================================================================
// 8. SYSTEM SETTINGS SCHEMAS
// ============================================================================

export const botSettingsSchema = z.object({
  botToken: z.string().min(1, 'Bot token is required').trim()
    .refine((token) => /^\d+:[A-Za-z0-9_-]{35}$/.test(token), {
      message: 'Invalid Telegram Bot Token format',
    }),
});

export const retrySettingsSchema = z.object({
  maxRetries: z.number().int().nonnegative('Max retries must be a non-negative integer'),
  initialDelayMs: z.number().int().positive('Initial delay must be a positive integer'),
  backoffMultiplier: z.number().positive('Backoff multiplier must be positive'),
});

// Inferred Types
export type BotSettingsInput = z.infer<typeof botSettingsSchema>;
export type RetrySettingsInput = z.infer<typeof retrySettingsSchema>;

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/*
  HOW TO USE SCHEMAS IN THE APPLICATION

  1. Using `.parse()` (throws ZodError on validation failure):
  -------------------------------------------------------------
  import { registerSchema } from '@/lib/validation';

  try {
    const validatedData = registerSchema.parse(req.body);
    // validatedData is typed as RegisterInput
    console.log(validatedData.email);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error(error.errors);
    }
  }

  2. Using `.safeParse()` (returns structured status object):
  -------------------------------------------------------------
  import { loginSchema } from '@/lib/validation';

  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    // validation failed, result.error contains the ZodError
    console.error(result.error.format());
  } else {
    // validation succeeded, result.data is the typed payload
    console.log(result.data.email);
  }

  3. Using the `validateInput` helper:
  -------------------------------------------------------------
  import { validateInput, createTrackerSchema } from '@/lib/validation';

  const result = validateInput(createTrackerSchema, req.body);
  if (!result.success) {
    // result.error is structured as Record<string, string[]>
    // Perfect for passing directly to ValidationError or React form builders
    return Response.json({ success: false, errors: result.error }, { status: 400 });
  }

  // result.data contains the successfully parsed and typed object
  const tracker = await db.insert(trackers).values(result.data).returning();
*/
