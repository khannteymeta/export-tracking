import { Bot } from 'grammy';
import { db } from '@/lib/db';
import { telegramChats, auditLogs, trackers, shipmentExports } from '@/db/schema';
import { eq, and, ne, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const token = process.env.TELEGRAM_BOT_TOKEN || '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ';
export const bot = new Bot(token);

// Set commands on Telegram Bot API
bot.api
  .setMyCommands([
    { command: 'start', description: 'Start the ExportTrack notification bot' },
    { command: 'help', description: 'Display available bot commands' },
    { command: 'status', description: 'Query current system tracking metrics' },
  ])
  .catch((err) => {
    logger.error('Failed to set Telegram bot commands', err);
  });

// Handle /start command
bot.command('start', async (ctx) => {
  await ctx.reply(
    '👋 Welcome to the *ExportTrack Notification Bot*!\n\nI will notify this chat about real-time cargo movement, geofence border events, and exceptions.',
    { parse_mode: 'Markdown' }
  );
});

// Handle /help command
bot.command('help', async (ctx) => {
  const helpText =
    '📖 *ExportTrack Bot Commands*:\n\n' +
    '• /start - Welcome message and introduction\n' +
    '• /status - Fetch real-time system status and metrics\n' +
    '• /help - Display this command helper menu';
  await ctx.reply(helpText, { parse_mode: 'Markdown' });
});

// Handle /status command
bot.command('status', async (ctx) => {
  try {
    const activeTrackersResult = await db
      .select({ count: sql`count(*)` })
      .from(trackers)
      .where(eq(trackers.status, 'active'))
      .then((res) => Number(res[0]?.count || 0));

    const activeShipmentsResult = await db
      .select({ count: sql`count(*)` })
      .from(shipmentExports)
      .where(
        and(
          ne(shipmentExports.status, 'export_confirmed'),
          ne(shipmentExports.status, 'exception')
        )
      )
      .then((res) => Number(res[0]?.count || 0));

    const exceptionShipmentsResult = await db
      .select({ count: sql`count(*)` })
      .from(shipmentExports)
      .where(eq(shipmentExports.status, 'exception'))
      .then((res) => Number(res[0]?.count || 0));

    const statusText =
      '📊 *System Status Metrics*:\n\n' +
      `• *Active Trackers*: ${activeTrackersResult}\n` +
      `• *Active Shipments*: ${activeShipmentsResult}\n` +
      `• *Pending Exceptions*: ${exceptionShipmentsResult}`;

    await ctx.reply(statusText, { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error('Failed to query status metrics inside Telegram bot command', err);
    await ctx.reply('⚠️ *System Status*: Active, but failed to fetch live database metrics.', {
      parse_mode: 'Markdown',
    });
  }
});

// Handle bot added to chat event (my_chat_member updates)
bot.on('my_chat_member', async (ctx) => {
  const chat = ctx.myChatMember.chat;
  const newStatus = ctx.myChatMember.new_chat_member.status;
  const isAdded = ['member', 'administrator', 'creator'].includes(newStatus);
  const chatIdBigInt = BigInt(chat.id);

  try {
    if (isAdded) {
      // 1. Check if the chat already exists in the database
      const existing = await db
        .select()
        .from(telegramChats)
        .where(eq(telegramChats.chatId, chatIdBigInt))
        .limit(1)
        .then((res) => res[0]);

      const title = chat.title || null;
      const username = chat.username || null;
      const firstName = chat.first_name || null;
      const lastName = chat.last_name || null;

      if (existing) {
        // Re-activate existing chat
        await db
          .update(telegramChats)
          .set({
            isActive: true,
            username,
            firstName,
            lastName,
            title,
            type: chat.type,
            updatedAt: new Date(),
          })
          .where(eq(telegramChats.chatId, chatIdBigInt));
      } else {
        // Insert new chat record
        await db.insert(telegramChats).values({
          chatId: chatIdBigInt,
          username,
          firstName,
          lastName,
          title,
          type: chat.type,
          isActive: true,
        });
      }

      // 2. Log bot added event to audit logs
      await db.insert(auditLogs).values({
        action: 'telegram_bot_added',
        entity: 'telegram_chat',
        newValue: { chatId: chat.id, title, type: chat.type },
      });

      // 3. Send greeting message
      await ctx.reply(
        '🤖 *ExportTrack Joined!*\n\nI have registered this chat for real-time shipment updates.',
        { parse_mode: 'Markdown' }
      );
    } else {
      // Bot was removed or kicked
      await db
        .update(telegramChats)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(telegramChats.chatId, chatIdBigInt));

      // Log bot removed event to audit logs
      await db.insert(auditLogs).values({
        action: 'telegram_bot_removed',
        entity: 'telegram_chat',
        newValue: { chatId: chat.id, title: chat.title || null },
      });
    }
  } catch (err) {
    logger.error('Failed to handle bot member status update', err);
  }
});

// Setup global error handler
bot.catch((err) => {
  logger.error(`Grammy Error: ${err.message}`, err.error);
});
