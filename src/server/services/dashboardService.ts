import { db } from '@/lib/db';
import {
  trackerEvents,
  shipmentExports,
  customerTelegramChats,
  telegramChats,
  exportBorderEvents,
  exportGeofences,
  trackers,
  customers,
} from '@/db/schema';
import { eq, and, ne, desc, sql } from 'drizzle-orm';
import { redisConnection } from '../jobs/queues';
import { logger } from '@/lib/logger';

// Helper to determine time range date threshold
function getTimeRangeLimit(timeRange?: string): Date {
  const now = new Date();
  if (timeRange === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (timeRange === 'week') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (timeRange === 'month') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return new Date(0); // Epoch start (all-time)
}

export const DashboardService = {
  /**
   * Retrieves high-level dashboard summaries, recent alerts list, events chart dataset, and health status.
   */
  async getSummary(timeRange?: 'today' | 'week' | 'month') {
    const cacheKey = `dashboard:summary:${timeRange || 'all'}`;

    // 1. Attempt cache retrieval
    try {
      const cached = await redisConnection.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err: any) {
      logger.warn(`[DashboardService] Redis get cache failure: ${err.message}`);
    }

    // 2. Query Active Chats Count (Unique linked Telegram chats that are active)
    const [{ count: activeChatsCount }] = await db
      .select({ count: sql<number>`COALESCE(count(distinct ${telegramChats.chatId}), 0)` })
      .from(customerTelegramChats)
      .innerJoin(telegramChats, eq(customerTelegramChats.telegramChatId, telegramChats.id))
      .where(eq(telegramChats.isActive, true));

    // 3. Query Timeframe Tracker Events Count
    let totalEventsQuery = db.select({ count: sql<number>`COALESCE(count(*), 0)` }).from(trackerEvents);
    if (timeRange) {
      totalEventsQuery = totalEventsQuery.where(sql`${trackerEvents.recordedAt} >= ${getTimeRangeLimit(timeRange).toISOString()}::timestamp`) as any;
    }
    const [{ count: totalTrackerEvents }] = await totalEventsQuery;

    // 4. Query Recent Alerts (Last 10 border events with shipment reference and geofence name)
    const recentAlerts = await db
      .select({
        id: exportBorderEvents.id,
        shipmentExportId: exportBorderEvents.shipmentExportId,
        eventType: exportBorderEvents.eventType,
        occurredAt: exportBorderEvents.occurredAt,
        notes: exportBorderEvents.notes,
        shipmentReference: shipmentExports.shipmentReference,
        productDescription: shipmentExports.productDescription,
        geofenceName: exportGeofences.name,
        customerName: customers.name,
      })
      .from(exportBorderEvents)
      .leftJoin(shipmentExports, eq(exportBorderEvents.shipmentExportId, shipmentExports.id))
      .leftJoin(exportGeofences, eq(exportBorderEvents.geofenceId, exportGeofences.id))
      .leftJoin(customers, eq(shipmentExports.customerId, customers.id))
      .orderBy(desc(exportBorderEvents.occurredAt))
      .limit(10);

    // 5. Query Active Shipment Exports Count (excluding confirmed exits & exceptions)
    const [{ count: activeShipmentExports }] = await db
      .select({ count: sql<number>`COALESCE(count(*), 0)` })
      .from(shipmentExports)
      .where(
        and(
          ne(shipmentExports.status, 'export_confirmed'),
          ne(shipmentExports.status, 'exception')
        )
      );

    // 6. Query Shipments in Exception Status
    const [{ count: exportsInException }] = await db
      .select({ count: sql<number>`COALESCE(count(*), 0)` })
      .from(shipmentExports)
      .where(eq(shipmentExports.status, 'exception'));

    // 7. Query Events Chart grouping for the past 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const chartData = await db
      .select({
        day: sql<string>`DATE(${trackerEvents.recordedAt})`,
        count: sql<number>`COALESCE(count(*), 0)`,
      })
      .from(trackerEvents)
      .where(sql`${trackerEvents.recordedAt} >= ${sevenDaysAgo.toISOString()}::timestamp`)
      .groupBy(sql`DATE(${trackerEvents.recordedAt})`)
      .orderBy(sql`DATE(${trackerEvents.recordedAt})`);

    const eventsChart = chartData.map((row) => ({
      timestamp: row.day,
      count: Number(row.count),
    }));

    // 8. Fetch system health metrics
    const systemHealth = await this.getSystemHealth();

    const summary = {
      activeChatsCount: Number(activeChatsCount),
      totalTrackerEvents: Number(totalTrackerEvents),
      recentAlerts,
      activeShipmentExports: Number(activeShipmentExports),
      exportsInException: Number(exportsInException),
      eventsChart,
      systemHealth,
    };

    // 9. Attempt cache storage
    try {
      await redisConnection.set(cacheKey, JSON.stringify(summary), 'EX', 300); // 5 minutes cache
    } catch (err: any) {
      logger.warn(`[DashboardService] Redis set cache failure: ${err.message}`);
    }

    return summary;
  },

  /**
   * Retrieves fine-grained tracker events performance, hourly aggregates, and identifies the most active tracker.
   */
  async getTrackerMetrics(customerId?: string, timeRange?: string) {
    const cacheKey = `dashboard:tracker:${customerId || 'all'}:${timeRange || 'all'}`;

    try {
      const cached = await redisConnection.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err: any) {
      logger.warn(`[DashboardService] Redis get cache failure: ${err.message}`);
    }

    // Build query filters
    const filters = [];
    if (customerId) {
      filters.push(eq(trackers.customerId, customerId));
    }
    if (timeRange) {
      filters.push(sql`${trackerEvents.recordedAt} >= ${getTimeRangeLimit(timeRange).toISOString()}::timestamp`);
    }
    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    // 1. Query Total Tracker Events count
    let totalEventsQuery = db.select({ count: sql<number>`COALESCE(count(*), 0)` }).from(trackerEvents);
    if (customerId) {
      totalEventsQuery = totalEventsQuery
        .innerJoin(trackers, eq(trackerEvents.trackerId, trackers.id))
        .where(whereClause!) as any;
    } else if (whereClause) {
      totalEventsQuery = totalEventsQuery.where(whereClause) as any;
    }
    const [{ count: totalEvents }] = await totalEventsQuery;

    // 2. Query Events Per Hour distribution
    let hourQuery = db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${trackerEvents.recordedAt})`,
        count: sql<number>`COALESCE(count(*), 0)`,
      })
      .from(trackerEvents);
    if (customerId) {
      hourQuery = hourQuery
        .innerJoin(trackers, eq(trackerEvents.trackerId, trackers.id))
        .where(whereClause!) as any;
    } else if (whereClause) {
      hourQuery = hourQuery.where(whereClause) as any;
    }
    const eventsPerHourData = await hourQuery
      .groupBy(sql`EXTRACT(HOUR FROM ${trackerEvents.recordedAt})`)
      .orderBy(sql`EXTRACT(HOUR FROM ${trackerEvents.recordedAt})`);

    const eventsPerHour = eventsPerHourData.map((row) => ({
      hour: Number(row.hour),
      count: Number(row.count),
    }));

    // 3. Query Events Per Tracker device
    let trackerQuery = db
      .select({
        trackerId: trackerEvents.trackerId,
        label: trackers.label,
        externalTrackerId: trackers.externalTrackerId,
        count: sql<number>`COALESCE(count(*), 0)`,
      })
      .from(trackerEvents)
      .innerJoin(trackers, eq(trackerEvents.trackerId, trackers.id));
    if (whereClause) {
      trackerQuery = trackerQuery.where(whereClause) as any;
    }
    const trackerData = await trackerQuery
      .groupBy(trackerEvents.trackerId, trackers.label, trackers.externalTrackerId)
      .orderBy(desc(sql`count(*)`));

    const eventsPerTracker = trackerData.map((row) => ({
      trackerId: row.trackerId,
      label: row.label,
      externalTrackerId: row.externalTrackerId,
      count: Number(row.count),
    }));

    const mostActiveTracker = eventsPerTracker[0] || null;

    const metrics = {
      totalEvents: Number(totalEvents),
      eventsPerHour,
      eventsPerTracker,
      mostActiveTracker,
    };

    try {
      await redisConnection.set(cacheKey, JSON.stringify(metrics), 'EX', 600); // 10 minutes cache
    } catch (err: any) {
      logger.warn(`[DashboardService] Redis set cache failure: ${err.message}`);
    }

    return metrics;
  },

  /**
   * Retrieves shipment export status metrics, average time to export completion, exception rates, and geographical destinations.
   */
  async getExportMetrics(destinationCountry?: string, productCategory?: string, timeRange?: string) {
    const cacheKey = `dashboard:export:${destinationCountry || 'all'}:${productCategory || 'all'}:${timeRange || 'all'}`;

    try {
      const cached = await redisConnection.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err: any) {
      logger.warn(`[DashboardService] Redis get cache failure: ${err.message}`);
    }

    // Build query filters
    const filters = [];
    if (destinationCountry) {
      filters.push(eq(shipmentExports.destinationCountry, destinationCountry));
    }
    if (productCategory) {
      filters.push(eq(shipmentExports.productCategory, productCategory as any));
    }
    if (timeRange) {
      filters.push(sql`${shipmentExports.createdAt} >= ${getTimeRangeLimit(timeRange).toISOString()}::timestamp`);
    }
    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    // 1. shipmentsByStatus
    let statusQuery = db
      .select({ status: shipmentExports.status, count: sql<number>`COALESCE(count(*), 0)` })
      .from(shipmentExports);
    if (whereClause) {
      statusQuery = statusQuery.where(whereClause) as any;
    }
    const statusData = await statusQuery.groupBy(shipmentExports.status);
    const shipmentsByStatus = statusData.map((row) => ({
      status: row.status,
      count: Number(row.count),
    }));

    // 2. avgTimeToExport
    const avgFilters = [eq(shipmentExports.status, 'export_confirmed')];
    if (destinationCountry) {
      avgFilters.push(eq(shipmentExports.destinationCountry, destinationCountry));
    }
    if (productCategory) {
      avgFilters.push(eq(shipmentExports.productCategory, productCategory as any));
    }
    if (timeRange) {
      avgFilters.push(sql`${shipmentExports.createdAt} >= ${getTimeRangeLimit(timeRange).toISOString()}::timestamp`);
    }
    const [{ avgSeconds }] = await db
      .select({
        avgSeconds: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${shipmentExports.updatedAt} - ${shipmentExports.createdAt}))), 0)`,
      })
      .from(shipmentExports)
      .where(and(...avgFilters));
    const avgTimeToExportHours = Number(avgSeconds) / 3600;

    // 3. exceptionRate
    let totalQuery = db.select({ count: sql<number>`COALESCE(count(*), 0)` }).from(shipmentExports);
    if (whereClause) {
      totalQuery = totalQuery.where(whereClause) as any;
    }
    const [{ count: totalCount }] = await totalQuery;

    const excFilters = [eq(shipmentExports.status, 'exception')];
    if (destinationCountry) {
      excFilters.push(eq(shipmentExports.destinationCountry, destinationCountry));
    }
    if (productCategory) {
      excFilters.push(eq(shipmentExports.productCategory, productCategory as any));
    }
    if (timeRange) {
      excFilters.push(sql`${shipmentExports.createdAt} >= ${getTimeRangeLimit(timeRange).toISOString()}::timestamp`);
    }
    const [{ count: exceptionCount }] = await db
      .select({ count: sql<number>`COALESCE(count(*), 0)` })
      .from(shipmentExports)
      .where(and(...excFilters));
    const exceptionRate = totalCount > 0 ? (Number(exceptionCount) / Number(totalCount)) * 100 : 0;

    // 4. shipmentsByDestination
    let destQuery = db
      .select({ destination: shipmentExports.destinationCountry, count: sql<number>`COALESCE(count(*), 0)` })
      .from(shipmentExports);
    if (whereClause) {
      destQuery = destQuery.where(whereClause) as any;
    }
    const destData = await destQuery.groupBy(shipmentExports.destinationCountry);
    const shipmentsByDestination = destData.map((row) => ({
      destinationCountry: row.destination,
      count: Number(row.count),
    }));

    // 5. shipmentsByProductCategory
    let prodQuery = db
      .select({ category: shipmentExports.productCategory, count: sql<number>`COALESCE(count(*), 0)` })
      .from(shipmentExports);
    if (whereClause) {
      prodQuery = prodQuery.where(whereClause) as any;
    }
    const prodData = await prodQuery.groupBy(shipmentExports.productCategory);
    const shipmentsByProductCategory = prodData.map((row) => ({
      productCategory: row.category,
      count: Number(row.count),
    }));

    const metrics = {
      shipmentsByStatus,
      avgTimeToExportHours,
      exceptionRate,
      shipmentsByDestination,
      shipmentsByProductCategory,
    };

    try {
      await redisConnection.set(cacheKey, JSON.stringify(metrics), 'EX', 600); // 10 minutes cache
    } catch (err: any) {
      logger.warn(`[DashboardService] Redis set cache failure: ${err.message}`);
    }

    return metrics;
  },

  /**
   * Performs quick diagnostic pings and queries against DB, Redis connection, and Telegram API configuration.
   */
  async getSystemHealth() {
    // 1. Redis status ping
    let redisStatus: 'ok' | 'error' = 'ok';
    try {
      const ping = await redisConnection.ping();
      if (ping !== 'PONG') redisStatus = 'error';
    } catch {
      redisStatus = 'error';
    }

    // 2. Database status query check
    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbStatus = 'error';
    }

    // 3. Telegram Grammy API status check
    let telegramStatus: 'ok' | 'error' = 'ok';
    try {
      const { bot } = await import('@/lib/telegram');
      const me = await bot.api.getMe();
      if (!me.username) telegramStatus = 'error';
    } catch {
      telegramStatus = 'error';
    }

    return {
      redis: redisStatus,
      db: dbStatus,
      telegram: telegramStatus,
    };
  },
};
