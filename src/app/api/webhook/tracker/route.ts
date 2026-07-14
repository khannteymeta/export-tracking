import { TrackerHandler } from '@/server/webhooks/trackerHandler';
import { TrackerService } from '@/server/services/trackerService';
import { db } from '@/lib/db';
import { webhookLogs } from '@/db/schema';
import { logger } from '@/lib/logger';
import { redisConnection } from '@/server/jobs/queues';
import { z } from 'zod';

const secret = process.env.WEBHOOK_SECRET || 'tracker-webhook-secret-key-development';

// In-memory set to deduplicate events received in the last 5 seconds
const seenEventIds = new Set<string>();

/**
 * Checks Redis rate limits for webhook events (maximum 1000 events/minute).
 * Fails open (bypasses rate limit) if Redis connection is down.
 */
async function checkRateLimit(): Promise<boolean> {
  try {
    const minuteKey = `webhook:tracker:events:${new Date().getMinutes()}`;
    const count = await redisConnection.incr(minuteKey);
    if (count === 1) {
      await redisConnection.expire(minuteKey, 60);
    }
    return count <= 1000;
  } catch (err: any) {
    logger.warn(`[Webhook Rate Limiter] Redis offline, bypassing check: ${err.message}`);
    return true;
  }
}

/**
 * Helper to log webhook attempts to the database webhook_logs table.
 */
async function logWebhookAttempt(url: string, payload: any, status: number, bodyText: string, error?: string) {
  try {
    await db.insert(webhookLogs).values({
      url,
      payload: payload || {},
      responseStatus: status,
      responseBody: bodyText,
      errorMessage: error || null,
    });
  } catch (err: any) {
    logger.error('[Webhook Route] Failed to save webhook log in database', err);
  }
}

export async function POST(req: Request) {
  let body: any = null;
  let eventId = '';

  try {
    // 1. Validate x-api-key header
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey || apiKey !== secret) {
      const errRes = { error: 'Unauthorized' };
      const bodyText = JSON.stringify(errRes);
      await logWebhookAttempt(req.url, {}, 401, bodyText, 'Unauthorized API Key');
      return Response.json(errRes, { status: 401 });
    }

    // 2. Check Redis rate limiter
    const rateLimitOk = await checkRateLimit();
    if (!rateLimitOk) {
      const errRes = { error: 'Rate limit exceeded' };
      const bodyText = JSON.stringify(errRes);
      await logWebhookAttempt(req.url, {}, 429, bodyText, 'Rate Limit Exceeded');
      return Response.json(errRes, { status: 429 });
    }

    // 3. Read and parse body
    try {
      body = await req.json();
    } catch {
      const errRes = { error: 'Invalid payload' };
      const bodyText = JSON.stringify(errRes);
      await logWebhookAttempt(req.url, {}, 400, bodyText, 'Malformed JSON payload');
      return Response.json(errRes, { status: 400 });
    }

    // 4. Validate payload schema with Zod
    let parsedEvent;
    try {
      parsedEvent = TrackerHandler.parseEvent(body);
    } catch (err) {
      const errRes = { error: 'Invalid payload' };
      const bodyText = JSON.stringify(errRes);
      await logWebhookAttempt(req.url, body, 400, bodyText, 'Payload schema validation failed');
      return Response.json(errRes, { status: 400 });
    }

    // 5. Prevent duplicate events (5-second window deduplication)
    eventId =
      body.eventId ||
      body.id ||
      body.raw?.eventId ||
      `${parsedEvent.externalTrackerId}:${parsedEvent.recordedAt.toISOString()}:${parsedEvent.lat}:${parsedEvent.lng}`;

    if (seenEventIds.has(eventId)) {
      // Return 200 OK immediately for duplicate checks
      const okRes = { success: true, duplicated: true };
      return Response.json(okRes, { status: 200 });
    }

    // Mark as seen and clean up after 5 seconds
    seenEventIds.add(eventId);
    setTimeout(() => seenEventIds.delete(eventId), 5000);

    // 6. Validate coordinate ranges and integrity
    const integrityOk = TrackerHandler.validateEventIntegrity(parsedEvent);
    if (!integrityOk) {
      const errRes = { error: 'Invalid payload' };
      const bodyText = JSON.stringify(errRes);
      await logWebhookAttempt(req.url, body, 400, bodyText, 'Payload coordinate integrity check failed');
      return Response.json(errRes, { status: 400 });
    }

    // 7. Store position event and update tracker lastSeenAt
    let tracker;
    try {
      tracker = await TrackerService.getByExternalId(parsedEvent.externalTrackerId);
      if (!tracker) {
        const errRes = { error: 'Invalid payload' };
        const bodyText = JSON.stringify(errRes);
        await logWebhookAttempt(req.url, body, 400, bodyText, `External Tracker ID ${parsedEvent.externalTrackerId} not found`);
        return Response.json(errRes, { status: 400 });
      }
    } catch (err: any) {
      const errRes = { error: 'Invalid payload' };
      const bodyText = JSON.stringify(errRes);
      await logWebhookAttempt(req.url, body, 400, bodyText, err.message);
      return Response.json(errRes, { status: 400 });
    }

    const trackerEventId = await TrackerHandler.storeEvent(parsedEvent);

    // 8. Enqueue background geofence check and template message jobs
    await TrackerHandler.enqueueExportGeofenceCheck(
      tracker.id,
      parsedEvent.lat,
      parsedEvent.lng,
      parsedEvent.recordedAt
    );

    // 9. Return success response immediately
    const successRes = {
      success: true,
      trackerEventId,
      timestamp: parsedEvent.recordedAt.toISOString(),
    };
    const bodyText = JSON.stringify(successRes);

    await logWebhookAttempt(req.url, body, 200, bodyText);

    return Response.json(successRes);
  } catch (error: any) {
    logger.error('[Webhook Route Error] Unexpected execution error', error);
    const errRes = { error: 'Internal server error' };
    const bodyText = JSON.stringify(errRes);
    await logWebhookAttempt(req.url, body || {}, 500, bodyText, error.message);
    return Response.json(errRes, { status: 500 });
  }
}
