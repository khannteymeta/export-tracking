import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TelegramService } from '@/server/services/telegramService';
import { db } from '@/lib/db';
import { bot } from '@/lib/telegram';
import { NotFoundError } from '@/lib/errors';

// Valid UUID strings
const VALID_CUSTOMER_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const VALID_TRACKER_ID = '8b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const VALID_SHIPMENT_ID = '7b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const VALID_TEMPLATE_ID = '5b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

// Helper to create a chainable mock for Drizzle ORM
const makeChainableMock = (finalValue?: any) => {
  const mock: any = {};
  const methods = ['select', 'from', 'where', 'limit', 'leftJoin', 'innerJoin', 'insert', 'values', 'returning', 'update', 'set'];
  methods.forEach((method) => {
    mock[method] = vi.fn().mockReturnValue(mock);
  });
  if (finalValue !== undefined) {
    mock.then = vi.fn((resolve) => resolve(finalValue));
  }
  return mock;
};

// Mock the db dependency
vi.mock('@/lib/db', () => {
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    },
  };
});

// Mock settingsService
vi.mock('@/server/services/settingsService', () => {
  return {
    SettingsService: {
      getSetting: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'MAX_RETRIES') return '3';
        if (key === 'INITIAL_DELAY_MS') return '1000';
        if (key === 'BACKOFF_MULTIPLIER') return '2.0';
        return null;
      }),
    },
  };
});

// Mock Grammy bot from @/lib/telegram
vi.mock('@/lib/telegram', () => {
  return {
    bot: {
      api: {
        sendMessage: vi.fn(),
      },
    },
  };
});

describe('TelegramService Unit Tests', () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
    vi.mocked(bot.api.sendMessage).mockReset();
  });

  describe('sendMessage', () => {
    it('should return true if bot.api.sendMessage succeeds', async () => {
      vi.mocked(bot.api.sendMessage).mockResolvedValue({} as any);

      const result = await TelegramService.sendMessage(12345n, 'Hello test');
      expect(result).toBe(true);
      expect(bot.api.sendMessage).toHaveBeenCalledWith(12345, 'Hello test', { parse_mode: 'Markdown' });
    });

    it('should return false if bot.api.sendMessage throws error', async () => {
      vi.mocked(bot.api.sendMessage).mockRejectedValue(new Error('Telegram API down'));

      const result = await TelegramService.sendMessage(12345n, 'Hello test');
      expect(result).toBe(false);
    });
  });

  describe('sendWithRetry', () => {
    it('should send immediately if first attempt succeeds', async () => {
      // Mock successful message send
      vi.mocked(bot.api.sendMessage).mockResolvedValue({} as any);

      const result = await TelegramService.sendWithRetry(12345n, 'Retry test', 3);

      expect(result).toEqual({ success: true, attempts: 1 });
      expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should retry up to maxRetries on failures', async () => {
      // Mock settings service settings
      const { SettingsService } = await import('@/server/services/settingsService');
      vi.mocked(SettingsService.getSetting).mockResolvedValueOnce('2'); // MAX_RETRIES
      vi.mocked(SettingsService.getSetting).mockResolvedValueOnce('1000'); // INITIAL_DELAY_MS
      vi.mocked(SettingsService.getSetting).mockResolvedValueOnce('2.0'); // BACKOFF_MULTIPLIER

      // Mock bot failures
      vi.mocked(bot.api.sendMessage).mockRejectedValue(new Error('Failed'));

      // Use a short setTimeout hook to bypass physical backoff delays in tests
      const spyTimeout = vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => fn());

      const result = await TelegramService.sendWithRetry(12345n, 'Retry test', 3);

      expect(result).toEqual({ success: false, attempts: 2 });
      expect(bot.api.sendMessage).toHaveBeenCalledTimes(2);

      spyTimeout.mockRestore();
    });
  });

  describe('renderAndSend', () => {
    it('should fetch details, render template, and dispatch message', async () => {
      const mockShipment = { id: VALID_SHIPMENT_ID, customerId: VALID_CUSTOMER_ID, trackerId: VALID_TRACKER_ID, shipmentReference: 'REF-X' };
      const mockTracker = { id: VALID_TRACKER_ID, label: 'TRK-1', trackerType: 'gps' };
      const mockCustomer = { id: VALID_CUSTOMER_ID, name: 'Google' };
      const mockTemplate = { id: VALID_TEMPLATE_ID, content: 'Shipment {{shipmentReference}} is active for {{customerName}}.' };

      // Mock database calls in renderAndSend sequence:
      // 1. Shipment
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockShipment]));
      // 2. Tracker
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockTracker]));
      // 3. Customer
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockCustomer]));
      // 4. Template
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockTemplate]));
      // 5. Customer telegram chats query
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([{ chatId: 112233n }]));

      vi.mocked(bot.api.sendMessage).mockResolvedValue({} as any);

      await TelegramService.renderAndSend(VALID_TEMPLATE_ID, VALID_SHIPMENT_ID);

      expect(bot.api.sendMessage).toHaveBeenCalledWith(
        112233,
        'Shipment REF-X is active for Google.',
        { parse_mode: 'Markdown' }
      );
    });
  });

  describe('sendExportAlert', () => {
    it('should dispatch approaching_exit alert to customer chats', async () => {
      const mockShipment = { id: VALID_SHIPMENT_ID, customerId: VALID_CUSTOMER_ID, trackerId: VALID_TRACKER_ID, productDescription: 'Textiles', destinationCountry: 'FR' };

      // 1. Fetch shipment
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockShipment]));
      // 2. Fetch customer chats
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([{ chatId: 556677n }]));

      vi.mocked(bot.api.sendMessage).mockResolvedValue({} as any);

      await TelegramService.sendExportAlert(VALID_SHIPMENT_ID, 'approaching_exit');

      expect(bot.api.sendMessage).toHaveBeenCalledWith(
        556677,
        expect.stringContaining('Approaching Exit Alert'),
        { parse_mode: 'Markdown' }
      );
    });

    it('should dispatch crossed_boundary alert to internal ops/admin chats', async () => {
      const mockShipment = { id: VALID_SHIPMENT_ID, customerId: VALID_CUSTOMER_ID, trackerId: VALID_TRACKER_ID, productDescription: 'Textiles', destinationCountry: 'FR' };

      // 1. Fetch shipment
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([mockShipment]));
      // 2. Fetch ops chats (active, left join customer chats null check)
      vi.mocked(db.select).mockReturnValueOnce(makeChainableMock([{ chatId: 998877n }]));

      vi.mocked(bot.api.sendMessage).mockResolvedValue({} as any);

      await TelegramService.sendExportAlert(VALID_SHIPMENT_ID, 'crossed_boundary');

      expect(bot.api.sendMessage).toHaveBeenCalledWith(
        998877,
        expect.stringContaining('Border Crossing Warning'),
        { parse_mode: 'Markdown' }
      );
    });
  });
});
