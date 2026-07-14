import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { db } from '@/lib/db';
import { customers } from '@/db/schema';
import { customerImportRowSchema } from '@/lib/validation';
import { inArray } from 'drizzle-orm';

// Redis connection configuration
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Setup Redis client with options recommended for BullMQ (maxRetriesPerRequest: null)
export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const importQueue = new Queue('customer-import', { connection: redisConnection });
export const importQueueEvents = new QueueEvents('customer-import', { connection: redisConnection });

let worker: Worker | null = null;

/**
 * Robust CSV parser that handles quotes and commas correctly.
 */
export function parseCSV(csv: string): Record<string, string>[] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if (char === '\n' && !inQuotes) {
      lines.push(currentLine);
      currentLine = '';
    } else if (char === '\r' && !inQuotes) {
      // ignore Carriage Return
    } else {
      currentLine += char;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length === 0) return [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    // Strip surrounding quotes from values
    return result.map(val => val.startsWith('"') && val.endsWith('"') ? val.slice(1, -1).trim() : val);
  };

  const headers = parseLine(lines[0]);
  const data: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header) {
        row[header.toLowerCase()] = values[index] || '';
      }
    });
    data.push(row);
  }
  return data;
}

/**
 * Initializes the BullMQ worker for the customer-import queue.
 * Ensures the worker is a singleton per process.
 */
export function initImportWorker() {
  if (worker) return;

  worker = new Worker(
    'customer-import',
    async (job) => {
      const { csvData } = job.data;
      if (typeof csvData !== 'string') {
        throw new Error('Invalid job payload: csvData must be a string');
      }

      const rows = parseCSV(csvData);
      const errors: { row: number; errors: string[] }[] = [];
      let success = 0;
      let failed = 0;

      const validRowsToInsert: any[] = [];
      const seenEmailsInCsv = new Set<string>();

      // First pass: Zod validation and CSV duplicate check
      const intermediateRows: { rowNumber: number; data: any }[] = [];

      for (let idx = 0; idx < rows.length; idx++) {
        const rowNumber = idx + 2; // header is row 1, first data row is 2
        const rawRow = rows[idx];

        // Validate structure via customerImportRowSchema
        const validation = customerImportRowSchema.safeParse(rawRow);
        if (!validation.success) {
          const fieldErrors = validation.error.flatten().fieldErrors;
          const errorMsgs: string[] = [];
          for (const key in fieldErrors) {
            errorMsgs.push(`${key}: ${fieldErrors[key]?.join(', ')}`);
          }
          errors.push({ row: rowNumber, errors: errorMsgs });
          failed++;
          continue;
        }

        const { name, email, phone, location } = validation.data;

        // Check for duplicate emails inside the CSV
        if (email) {
          const lowerEmail = email.toLowerCase().trim();
          if (seenEmailsInCsv.has(lowerEmail)) {
            errors.push({ row: rowNumber, errors: [`Duplicate email in CSV: ${email}`] });
            failed++;
            continue;
          }
          seenEmailsInCsv.add(lowerEmail);
        }

        intermediateRows.push({
          rowNumber,
          data: { name, email, phone, location },
        });
      }

      // Collect all non-empty emails to perform a single batch database check
      const emailsToCheck = intermediateRows
        .map((r) => r.data.email)
        .filter((email): email is string => !!email);

      const dbDuplicateEmails = new Set<string>();

      if (emailsToCheck.length > 0) {
        const existingCustomers = await db
          .select({ email: customers.email })
          .from(customers)
          .where(inArray(customers.email, emailsToCheck));

        existingCustomers.forEach((c) => {
          if (c.email) {
            dbDuplicateEmails.add(c.email.toLowerCase().trim());
          }
        });
      }

      // Second pass: database duplicate check and building insert payload
      for (const item of intermediateRows) {
        const { name, email, phone, location } = item.data;

        if (email && dbDuplicateEmails.has(email.toLowerCase().trim())) {
          errors.push({ row: item.rowNumber, errors: [`Email already exists in database: ${email}`] });
          failed++;
          continue;
        }

        validRowsToInsert.push({
          name,
          email: email ? email.toLowerCase().trim() : null, // must be null if empty to satisfy Postgres unique constraint
          phone: phone || null,
          address: location || null, // map location -> address
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        success++;
      }

      // Batch insert valid records (1000 per batch)
      if (validRowsToInsert.length > 0) {
        for (let i = 0; i < validRowsToInsert.length; i += 1000) {
          const chunk = validRowsToInsert.slice(i, i + 1000);
          await db.insert(customers).values(chunk);
        }
      }

      return {
        success,
        failed,
        errors,
      };
    },
    { connection: redisConnection }
  );

  worker.on('failed', (job, err) => {
    console.error(`Import Worker: Job ${job?.id} failed:`, err);
  });
}
