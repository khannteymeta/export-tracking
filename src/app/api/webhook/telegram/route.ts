import { bot } from '@/lib/telegram';
import { webhookCallback } from 'grammy';

// Handle POST requests from Telegram Webhook
export const POST = webhookCallback(bot, 'std/http');
