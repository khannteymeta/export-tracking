import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema';

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/exporttrack';

// Connection pooling (max 20 connections) and auto-reconnect (managed by postgres.js)
const client = postgres(connectionString, {
  max: 20,
  onclose: (connId) => {
    console.warn(`Database connection ${connId} closed. Client will auto-reconnect on subsequent queries.`);
  },
});

export const db = drizzle(client, { schema });
