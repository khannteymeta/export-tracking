import { db } from '@/lib/db';
import { systemSettings, auditLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { redisConnection } from '../jobs/queues';
import { logger } from '@/lib/logger';
import { ValidationError } from '@/lib/errors';
import { Bot } from 'grammy';

export const DEFAULT_SETTINGS: Record<string, string> = {
  DEFAULT_BOT_TOKEN: '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ',
  BOT_WEBHOOK_URL: '',
  MAX_RETRIES: '3',
  INITIAL_DELAY_MS: '1000',
  MAX_DELAY_MS: '60000',
  BACKOFF_MULTIPLIER: '2.0',
  WEBHOOK_EVENTS_PER_MIN: '1000',
  API_CALLS_PER_MIN: '10000',
  MESSAGES_PER_MIN: '1000',
  EXPORT_EXIT_DEBOUNCE_PINGS: '3',
  EXPORT_SIGNAL_LOSS_HOURS: '6',
  EXPORT_OPS_CHAT_IDS: '',
};

export const SettingsService = {
  /**
   * Retrieves an individual setting value by key.
   * Utilizes Redis cache with a 1-hour TTL and fallback to DB.
   */
  async getSetting(key: string): Promise<string | null> {
    const cacheKey = `settings:${key}`;

    // 1. Try to read from cache
    try {
      const cachedValue = await redisConnection.get(cacheKey);
      if (cachedValue !== null && cachedValue !== undefined) {
        return cachedValue === '__NULL__' ? null : cachedValue;
      }
    } catch (err: any) {
      logger.warn(`[SettingsService] Redis get cache failure for key "${key}": ${err.message}`);
    }

    // 2. Query from Drizzle postgres DB
    const setting = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1)
      .then((res) => res[0]);

    const value = setting ? setting.value : null;

    // 3. Cache the value (or '__NULL__' placeholder)
    try {
      await redisConnection.set(
        cacheKey,
        value === null ? '__NULL__' : value,
        'EX',
        3600 // 1 hour TTL
      );
    } catch (err: any) {
      logger.warn(`[SettingsService] Redis set cache failure for key "${key}": ${err.message}`);
    }

    return value;
  },

  /**
   * Retrieves all settings as a key-value dictionary.
   */
  async getAllSettings(): Promise<Record<string, string>> {
    const rows = await db.select().from(systemSettings);
    
    // Start with default settings, then override with DB values
    const settingsMap = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      settingsMap[row.key] = row.value;
    }
    
    return settingsMap;
  },

  /**
   * Validates bot token via Telegram getMe API.
   */
  async validateBotToken(token: string): Promise<boolean> {
    if (!token || token.trim() === '' || token === DEFAULT_SETTINGS.DEFAULT_BOT_TOKEN) {
      return false;
    }
    
    try {
      const tempBot = new Bot(token);
      const me = await tempBot.api.getMe();
      return !!me.username;
    } catch (err: any) {
      logger.warn(`[SettingsService] Telegram bot token validation failed: ${err.message}`);
      return false;
    }
  },

  /**
   * Validates and updates a setting value.
   * Logs updates to audit log, clears cache, and reloads active configuration.
   */
  async updateSetting(key: string, value: string, updatedBy: string): Promise<void> {
    const trimmedValue = value.trim();

    // 1. Inbound validation checks based on setting key
    if (key === 'DEFAULT_BOT_TOKEN') {
      // Bypass if the value is masked
      if (trimmedValue === '*****') {
        return;
      }
      if (!/^\d+:[A-Za-z0-9_-]{35}$/.test(trimmedValue)) {
        throw new ValidationError({ [key]: ['Invalid Telegram Bot Token format'] });
      }
      const isValid = await this.validateBotToken(trimmedValue);
      if (!isValid) {
        throw new ValidationError({ [key]: ['Failed to connect to Telegram API with this bot token'] });
      }
    } else if (key === 'BOT_WEBHOOK_URL') {
      if (trimmedValue !== '') {
        try {
          new URL(trimmedValue);
        } catch {
          throw new ValidationError({ [key]: ['Must be a valid URL (e.g. https://domain.com/webhook)'] });
        }
      }
    } else if (key === 'MAX_RETRIES') {
      const val = parseInt(trimmedValue, 10);
      if (isNaN(val) || val < 1 || val > 10) {
        throw new ValidationError({ [key]: ['Max retries must be an integer between 1 and 10'] });
      }
    } else if (key === 'INITIAL_DELAY_MS') {
      const val = parseInt(trimmedValue, 10);
      if (isNaN(val) || val <= 0) {
        throw new ValidationError({ [key]: ['Initial delay must be a positive integer (ms)'] });
      }
    } else if (key === 'MAX_DELAY_MS') {
      const val = parseInt(trimmedValue, 10);
      if (isNaN(val) || val <= 0) {
        throw new ValidationError({ [key]: ['Maximum delay must be a positive integer (ms)'] });
      }
    } else if (key === 'BACKOFF_MULTIPLIER') {
      const val = parseFloat(trimmedValue);
      if (isNaN(val) || val <= 0) {
        throw new ValidationError({ [key]: ['Backoff multiplier must be a positive number'] });
      }
    } else if (
      key === 'WEBHOOK_EVENTS_PER_MIN' ||
      key === 'API_CALLS_PER_MIN' ||
      key === 'MESSAGES_PER_MIN' ||
      key === 'EXPORT_EXIT_DEBOUNCE_PINGS' ||
      key === 'EXPORT_SIGNAL_LOSS_HOURS'
    ) {
      const val = parseInt(trimmedValue, 10);
      if (isNaN(val) || val <= 0) {
        throw new ValidationError({ [key]: [`Must be a positive integer`] });
      }
    } else if (key === 'EXPORT_OPS_CHAT_IDS') {
      if (trimmedValue !== '') {
        const ids = trimmedValue.split(',').map((s) => s.trim());
        const allValid = ids.every((id) => /^-?\d+$/.test(id));
        if (!allValid) {
          throw new ValidationError({ [key]: ['Must be a comma-separated list of numeric chat IDs'] });
        }
      }
    } else {
      throw new ValidationError({ [key]: ['Unknown setting key'] });
    }

    // 2. Fetch the old value for audit logging
    const oldValueRow = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1)
      .then((res) => res[0]);
    const oldValue = oldValueRow ? oldValueRow.value : (DEFAULT_SETTINGS[key] || null);

    // 3. Upsert setting in the database
    await db
      .insert(systemSettings)
      .values({
        key,
        value: trimmedValue,
        description: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: trimmedValue,
          updatedAt: new Date(),
        },
      });

    // 4. Log change to audit log
    await db.insert(auditLogs).values({
      userId: updatedBy,
      action: 'update_system_setting',
      entity: 'system_setting',
      entityId: key,
      oldValue: oldValue !== null ? { value: oldValue } : null,
      newValue: { value: trimmedValue },
    });

    // 5. Invalidate cached value
    try {
      await redisConnection.del(`settings:${key}`);
    } catch (err: any) {
      logger.warn(`[SettingsService] Redis del cache failure: ${err.message}`);
    }

    // 6. Reload live system configurations dynamically
    if (key === 'DEFAULT_BOT_TOKEN') {
      try {
        const { bot } = await import('@/lib/telegram');
        (bot as any).token = trimmedValue;
        (bot.api as any).token = trimmedValue;
        logger.info('[SettingsService] Successfully reloaded Grammy bot instance token');
      } catch (err: any) {
        logger.error(`[SettingsService] Failed to reload active bot token: ${err.message}`);
      }
    }
  },

  /**
   * Resets all settings to their default hardcoded configurations.
   */
  async resetToDefaults(updatedBy: string): Promise<void> {
    logger.info(`[SettingsService] Resetting system settings to default configurations (Triggered by ${updatedBy})`);

    // Reset settings in database
    for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
      await db
        .insert(systemSettings)
        .values({
          key,
          value: val,
          description: null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: {
            value: val,
            updatedAt: new Date(),
          },
        });

      // Clear cache
      try {
        await redisConnection.del(`settings:${key}`);
      } catch (err: any) {
        logger.warn(`[SettingsService] Redis cache clear failure: ${err.message}`);
      }
    }

    // Write a single consolidated reset audit log entry
    await db.insert(auditLogs).values({
      userId: updatedBy,
      action: 'reset_system_settings_to_defaults',
      entity: 'system_setting',
      entityId: 'ALL_KEYS',
      newValue: DEFAULT_SETTINGS,
    });

    // Reload active telegram bot to default seeded token
    try {
      const { bot } = await import('@/lib/telegram');
      (bot as any).token = DEFAULT_SETTINGS.DEFAULT_BOT_TOKEN;
      (bot.api as any).token = DEFAULT_SETTINGS.DEFAULT_BOT_TOKEN;
      logger.info('[SettingsService] Reset bot instance token to default');
    } catch (err: any) {
      logger.error(`[SettingsService] Failed to reset active bot token: ${err.message}`);
    }
  },
};
