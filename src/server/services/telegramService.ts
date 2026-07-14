import { bot } from '@/lib/telegram';
import { db } from '@/lib/db';
import {
  systemSettings,
  shipmentExports,
  trackers,
  customers,
  templates,
  telegramChats,
  customerTelegramChats,
} from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { TemplateService } from './templateService';

export const TelegramService = {
  /**
   * Sends a message via Grammy bot.api.sendMessage.
   * Returns a boolean indicating success or failure.
   */
  async sendMessage(chatId: bigint, message: string): Promise<boolean> {
    try {
      const numericChatId = Number(chatId);
      await bot.api.sendMessage(numericChatId, message, { parse_mode: 'Markdown' });
      logger.info(`[TelegramService] Successfully sent message to chat ${chatId}`);
      return true;
    } catch (err: any) {
      logger.warn(`[TelegramService] Failed to send message to chat ${chatId}: ${err.message}`);
      return false;
    }
  },

  /**
   * Sends a message with exponential backoff retries.
   * Reads the max retry count from SystemSettings.
   */
  async sendWithRetry(
    chatId: bigint,
    message: string,
    retries = 3
  ): Promise<{ success: boolean; attempts: number }> {
    // Retrieve custom retry count setting if configured
    let maxRetries = retries;
    try {
      const setting = await db
        .select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, 'telegram_max_retries'))
        .limit(1)
        .then((res) => res[0]);

      if (setting?.value) {
        maxRetries = parseInt(setting.value, 10);
      }
    } catch (err: any) {
      logger.warn(`[TelegramService] Failed to load max retries setting, falling back to ${retries}: ${err.message}`);
    }

    let success = false;
    let attempts = 0;

    while (attempts < maxRetries && !success) {
      attempts++;
      logger.info(`[TelegramService] Sending message to chat ${chatId} (Attempt ${attempts}/${maxRetries})...`);

      success = await this.sendMessage(chatId, message);

      if (!success && attempts < maxRetries) {
        // Calculate backoff: 1000 * 2^attempt milliseconds
        const delay = 1000 * Math.pow(2, attempts);
        logger.info(`[TelegramService] Backing off for ${delay}ms before next retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return { success, attempts };
  },

  /**
   * Renders a message template and dispatches to the customer's linked chats.
   */
  async renderAndSend(templateId: string, shipmentExportId: string): Promise<void> {
    // 1. Fetch shipment export
    const shipment = await db
      .select()
      .from(shipmentExports)
      .where(eq(shipmentExports.id, shipmentExportId))
      .limit(1)
      .then((res) => res[0]);

    if (!shipment) {
      throw new NotFoundError(`Shipment with ID ${shipmentExportId}`);
    }

    // 2. Fetch tracker details
    const tracker = await db
      .select()
      .from(trackers)
      .where(eq(trackers.id, shipment.trackerId))
      .limit(1)
      .then((res) => res[0]);

    // 3. Fetch customer details
    const customer = await db
      .select()
      .from(customers)
      .where(eq(customers.id, shipment.customerId))
      .limit(1)
      .then((res) => res[0]);

    // 4. Fetch message template
    const template = await db
      .select()
      .from(templates)
      .where(eq(templates.id, templateId))
      .limit(1)
      .then((res) => res[0]);

    if (!template) {
      throw new NotFoundError(`Template with ID ${templateId}`);
    }

    // 5. Interpolate data
    const renderData = {
      ...shipment,
      trackerLabel: tracker?.label || '',
      trackerType: tracker?.trackerType || '',
      customerName: customer?.name || '',
      customerEmail: customer?.email || '',
    };
    const message = TemplateService.render(template.content, renderData);

    // 6. Get linked active telegram chats for customer
    const chats = await db
      .select({ chatId: telegramChats.chatId })
      .from(customerTelegramChats)
      .innerJoin(telegramChats, eq(customerTelegramChats.telegramChatId, telegramChats.id))
      .where(
        and(
          eq(customerTelegramChats.customerId, shipment.customerId),
          eq(telegramChats.isActive, true)
        )
      );

    for (const chat of chats) {
      const result = await this.sendWithRetry(chat.chatId, message);
      logger.info(
        `[TelegramService] Rendered template ${templateId} delivery status to chat ${chat.chatId}: ${
          result.success ? 'Delivered' : 'Failed'
        } after ${result.attempts} attempts`
      );
    }
  },

  /**
   * Formats a fixed notification template per alert type and alerts target chats.
   */
  async sendExportAlert(
    shipmentExportId: string,
    alertType: 'approaching_exit' | 'crossed_boundary' | 're_entered' | 'exception' | 'confirmed',
    extra?: Record<string, unknown>
  ): Promise<void> {
    const shipment = await db
      .select()
      .from(shipmentExports)
      .where(eq(shipmentExports.id, shipmentExportId))
      .limit(1)
      .then((res) => res[0]);

    if (!shipment) {
      throw new NotFoundError(`Shipment with ID ${shipmentExportId}`);
    }

    const ref = shipment.shipmentReference || shipment.id;
    const desc = shipment.productDescription;
    const country = shipment.destinationCountry;

    let message = '';
    switch (alertType) {
      case 'approaching_exit':
        message =
          `🔔 *Approaching Exit Alert*\n\n` +
          `• *Shipment Ref*: ${ref}\n` +
          `• *Product*: ${desc}\n` +
          `• *Destination*: ${country}\n\n` +
          `The cargo is approaching the exit zone boundary.`;
        break;
      case 'crossed_boundary':
        message =
          `⚠️ *Border Crossing Warning*\n\n` +
          `• *Shipment Ref*: ${ref}\n` +
          `• *Product*: ${desc}\n` +
          `• *Destination*: ${country}\n\n` +
          `The shipment has crossed the country border boundary!`;
        break;
      case 're_entered':
        message =
          `🔄 *Re-entry Warning*\n\n` +
          `• *Shipment Ref*: ${ref}\n` +
          `• *Product*: ${desc}\n` +
          `• *Destination*: ${country}\n\n` +
          `The shipment has re-entered the country boundary. Status is reverted to in_transit.`;
        break;
      case 'exception':
        const reason = extra?.reason || 'Unknown exception reason';
        message =
          `🚨 *Exception Alert*\n\n` +
          `• *Shipment Ref*: ${ref}\n` +
          `• *Product*: ${desc}\n` +
          `• *Destination*: ${country}\n` +
          `• *Reason*: ${reason}\n\n` +
          `The shipment has been flagged with an exception alert.`;
        break;
      case 'confirmed':
        message =
          `✅ *Export Confirmed Alert*\n\n` +
          `• *Shipment Ref*: ${ref}\n` +
          `• *Product*: ${desc}\n` +
          `• *Destination*: ${country}\n\n` +
          `The shipment exit has been successfully confirmed.`;
        break;
    }

    // Determine target chats
    let chats: { chatId: bigint }[] = [];
    if (alertType === 'approaching_exit' || alertType === 'confirmed') {
      // Customer chats
      chats = await db
        .select({ chatId: telegramChats.chatId })
        .from(customerTelegramChats)
        .innerJoin(telegramChats, eq(customerTelegramChats.telegramChatId, telegramChats.id))
        .where(
          and(
            eq(customerTelegramChats.customerId, shipment.customerId),
            eq(telegramChats.isActive, true)
          )
        );
    } else {
      // Ops/Admin chats
      chats = await db
        .select({ chatId: telegramChats.chatId })
        .from(telegramChats)
        .leftJoin(customerTelegramChats, eq(telegramChats.id, customerTelegramChats.telegramChatId))
        .where(
          and(
            eq(telegramChats.isActive, true),
            sql`${customerTelegramChats.id} is null`
          )
        );
    }

    for (const chat of chats) {
      await this.sendWithRetry(chat.chatId, message);
    }
  },

  /**
   * Helper to parse and extract chat details from Telegram member status update.
   */
  async detectChatId(update: any): Promise<{ chatId: bigint; chatType: string; title: string } | null> {
    if (update?.my_chat_member) {
      const chat = update.my_chat_member.chat;
      const title =
        chat.title ||
        chat.username ||
        `${chat.first_name || ''} ${chat.last_name || ''}`.trim() ||
        'Unknown Chat';

      return {
        chatId: BigInt(chat.id),
        chatType: chat.type,
        title,
      };
    }
    return null;
  },
};
