import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users, systemSettings, exportGeofences } from './schema';

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/exporttrack';

console.log('Connecting to database for seeding...');
const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

export async function seedAdminUser() {
  console.log('Seeding default admin user...');
  await db
    .insert(users)
    .values({
      id: 'usr_admin_default',
      name: 'System Administrator',
      email: 'admin@exporttrack.com',
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
  console.log('Default admin user seeded.');
}

export async function seedSystemSettings() {
  console.log('Seeding default system settings...');
  const settings = [
    {
      key: 'system_name',
      value: 'ExportTrack Cargo Portal',
      description: 'The display name of the shipment tracking portal',
    },
    {
      key: 'geofence_default_buffer_meters',
      value: '200',
      description: 'Default buffer range in meters around geofences',
    },
    {
      key: 'telegram_bot_token',
      value: '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ',
      description: 'Telegram bot API token for shipment alerts',
    },
    {
      key: 'alert_retry_limit',
      value: '5',
      description: 'Maximum number of retries for failed webhook alerts',
    },
  ];

  for (const setting of settings) {
    await db
      .insert(systemSettings)
      .values({
        key: setting.key,
        value: setting.value,
        description: setting.description,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: setting.value,
          description: setting.description,
          updatedAt: new Date(),
        },
      });
  }
  console.log('System settings seeded.');
}

export async function seedExportGeofences() {
  console.log('Seeding example export geofences...');
  const geofences = [
    {
      name: 'US-Mexico Border Buffer Zone (El Paso)',
      type: 'country_border' as const,
      countryCode: 'US',
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [-106.6, 31.8],
            [-106.3, 31.8],
            [-106.3, 31.6],
            [-106.6, 31.6],
            [-106.6, 31.8],
          ],
        ],
      },
      bufferMeters: 500,
      isActive: true,
    },
    {
      name: 'Port of Singapore Cargo Terminal Zone',
      type: 'port_zone' as const,
      countryCode: 'SG',
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [103.8, 1.25],
            [103.85, 1.25],
            [103.85, 1.2],
            [103.8, 1.2],
            [103.8, 1.25],
          ],
        ],
      },
      bufferMeters: 100,
      isActive: true,
    },
    {
      name: 'Changi Air Cargo Logistics Park',
      type: 'airport_zone' as const,
      countryCode: 'SG',
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [103.98, 1.37],
            [104.01, 1.37],
            [104.01, 1.34],
            [103.98, 1.34],
            [103.98, 1.37],
          ],
        ],
      },
      bufferMeters: 50,
      isActive: true,
    },
    {
      name: 'Woodlands Crossing Checkpoint Buffer',
      type: 'checkpoint_buffer' as const,
      countryCode: 'SG',
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [103.76, 1.45],
            [103.78, 1.45],
            [103.78, 1.43],
            [103.76, 1.43],
            [103.76, 1.45],
          ],
        ],
      },
      bufferMeters: 250,
      isActive: true,
    },
  ];

  for (const geofence of geofences) {
    await db
      .insert(exportGeofences)
      .values({
        name: geofence.name,
        type: geofence.type,
        countryCode: geofence.countryCode,
        polygon: geofence.polygon,
        bufferMeters: geofence.bufferMeters,
        isActive: geofence.isActive,
      })
      // Since geofences don't have a unique key, we can check by name to avoid duplicates on re-seed
      .onConflictDoNothing();
  }
  console.log('Export geofences seeded.');
}

export async function seed() {
  try {
    await seedAdminUser();
    await seedSystemSettings();
    await seedExportGeofences();
    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Error during seeding:', error);
    throw error;
  }
}

// Check if run directly
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('seed.ts')) {
  seed()
    .then(async () => {
      await sql.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await sql.end();
      process.exit(1);
    });
}
