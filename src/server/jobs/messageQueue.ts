import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { TelegramService } from '../services/telegramService';
import { logger } from '@/lib/logger';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const messageQueue = new Queue('message-delivery', { connection: redisConnection as any });
export const messageQueueEvents = new QueueEvents('message-delivery', { connection: redisConnection as any });

let worker: Worker | null = null;

export function initMessageWorker() {
  if (worker) return;

  worker = new Worker(
    'message-delivery',
    async (job) => {
      const { templateId, shipmentExportId } = job.data;
      logger.info(`[MessageWorker] Dispatching rendered template alert ${templateId} for shipment ${shipmentExportId}`);
      await TelegramService.renderAndSend(templateId, shipmentExportId);
    },
    { connection: redisConnection as any }
  );

  worker.on('failed', (job, err) => {
    logger.error(`[MessageWorker] Job ${job?.id} failed: ${err.message}`, err);
  });
}
