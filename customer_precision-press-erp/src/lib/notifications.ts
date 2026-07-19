// @ts-nocheck
'use server';

import { adminDb } from './firebase-admin';
import { supabaseServer } from './supabase-server';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';

export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  message: string;
  channel?: NotificationChannel;
  metadata?: Record<string, any>;
}

// ─── Internal: write to notifications_log ─────────────────────────────────────

async function logNotification({
  id,
  userId,
  channel,
  status,
  title,
  body,
  retryCount = 0,
  errorMessage,
  metadata,
}: {
  id: string;
  userId: string;
  channel: NotificationChannel;
  status: 'SENT' | 'FAILED' | 'PENDING';
  title?: string;
  body?: string;
  retryCount?: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
}) {
  try {
    await supabaseServer.from('notifications_log').insert({
      id,
      user_id: userId,
      channel,
      status,
      title: title || 'Notification',
      body: body || '',
      retry_count: retryCount,
      delivery_time: new Date().toISOString(),
      error_message: errorMessage || null,
      metadata: metadata || {},
    });
  } catch (err) {
    console.error('[Notifications Log] Failed to write log:', err);
  }
}

// ─── IN-APP push via Supabase notifications table ────────────────────────────

async function sendInAppNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  metadata?: Record<string, any>
): Promise<void> {
  const id = `NOTIF-INAPP-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  try {
    // NOTE: The Supabase `notifications` table schema: id, user_id, type, title, message, read, created_at
    // There is NO `metadata` column. To preserve metadata, store extra context in the title/message or notifications_log.
    const { error } = await (supabaseServer as any).from('notifications').insert({
      id,
      user_id: userId,
      type,
      title,
      message,
      read: false,
      created_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    await logNotification({ id, userId, channel: 'IN_APP', status: 'SENT', title, body: message });
  } catch (err: any) {
    await logNotification({ id, userId, channel: 'IN_APP', status: 'FAILED', title, body: message, errorMessage: err?.message });
    throw err;
  }
}



// ─── EMAIL (stub — replace with SendGrid / Resend / Nodemailer) ───────────────

async function sendEmailNotification(
  userId: string,
  title: string,
  message: string,
  metadata?: Record<string, any>
): Promise<void> {
  const id = `NOTIF-EMAIL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  try {
    // TODO: Replace with your email provider (e.g. Resend, SendGrid)
    console.log(`[Email] To=${userId} Subject="${title}" Body="${message}"`);
    await logNotification({ id, userId, channel: 'EMAIL', status: 'SENT', metadata });
  } catch (err: any) {
    await logNotification({ id, userId, channel: 'EMAIL', status: 'FAILED', errorMessage: err?.message, metadata });
    throw err;
  }
}

// ─── SMS (stub — replace with Twilio / AWS SNS / MSG91) ──────────────────────

async function sendSMSNotification(
  userId: string,
  message: string,
  metadata?: Record<string, any>
): Promise<void> {
  const id = `NOTIF-SMS-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  try {
    // TODO: Replace with your SMS provider (e.g. MSG91, Twilio)
    console.log(`[SMS] To=${userId} Body="${message}"`);
    await logNotification({ id, userId, channel: 'SMS', status: 'SENT', metadata });
  } catch (err: any) {
    await logNotification({ id, userId, channel: 'SMS', status: 'FAILED', errorMessage: err?.message, metadata });
    throw err;
  }
}

// ─── WHATSAPP (stub — replace with official API or Wati) ─────────────────────

async function sendWhatsAppNotification(
  userId: string,
  message: string,
  metadata?: Record<string, any>
): Promise<void> {
  const id = `NOTIF-WA-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  try {
    // TODO: Replace with WhatsApp Business API (e.g. Wati, 360dialog)
    console.log(`[WhatsApp] To=${userId} Body="${message}"`);
    await logNotification({ id, userId, channel: 'WHATSAPP', status: 'SENT', metadata });
  } catch (err: any) {
    await logNotification({ id, userId, channel: 'WHATSAPP', status: 'FAILED', errorMessage: err?.message, metadata });
    throw err;
  }
}

// ─── Primary public API ───────────────────────────────────────────────────────

/**
 * Send a notification via one or more channels.
 * Channel defaults to IN_APP if not specified.
 * Never throws — all failures are logged to notifications_log.
 */
export async function sendNotification(
  userId: string,
  type: string,
  message: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await sendInAppNotification(userId, type, type, message, metadata);
  } catch (err) {
    console.error('[Notifications] In-app delivery failed:', err);
  }
}

/**
 * Send a notification through a specific channel with full title/message.
 * This is the preferred higher-level API for business events.
 */
export async function dispatchNotification(payload: NotificationPayload): Promise<{ success: boolean }> {
  const { userId, type, title, message, channel = 'IN_APP', metadata } = payload;

  try {
    switch (channel) {
      case 'IN_APP':
        await sendInAppNotification(userId, type, title, message, metadata);
        break;
      case 'EMAIL':
        await sendEmailNotification(userId, title, message, metadata);
        break;
      case 'SMS':
        await sendSMSNotification(userId, message, metadata);
        break;
      case 'WHATSAPP':
        await sendWhatsAppNotification(userId, message, metadata);
        break;
      default:
        console.warn(`[Notifications] Unknown channel: ${channel}`);
    }
    return { success: true };
  } catch (err: any) {
    console.error('[Notifications] dispatchNotification failed:', err);
    return { success: false };
  }
}

/**
 * Send an order-related notification across IN_APP + SMS channels.
 * Used by workflow transitions, payment verifications, and dispatch events.
 */
export async function sendOrderNotification(
  userId: string,
  orderId: string,
  event: 'PLACED' | 'CONFIRMED' | 'IN_PROGRESS' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED' | 'PAYMENT_VERIFIED',
  metadata?: Record<string, any>
): Promise<void> {
  const messages: Record<string, { title: string; message: string }> = {
    PLACED:           { title: 'Order Placed',         message: `Your order ${orderId} has been received and is being processed.` },
    CONFIRMED:        { title: 'Order Confirmed',       message: `Your order ${orderId} has been confirmed and work has begun.` },
    IN_PROGRESS:      { title: 'Order In Progress',     message: `Your order ${orderId} is currently in production.` },
    DISPATCHED:       { title: 'Order Dispatched',      message: `Your order ${orderId} has been dispatched and is on its way.` },
    DELIVERED:        { title: 'Order Delivered',       message: `Your order ${orderId} has been successfully delivered.` },
    CANCELLED:        { title: 'Order Cancelled',       message: `Your order ${orderId} has been cancelled. Contact support if this was unexpected.` },
    PAYMENT_VERIFIED: { title: 'Payment Verified',      message: `Payment for order ${orderId} has been verified successfully.` },
  };

  const notif = messages[event];
  if (!notif) return;

  const meta = { orderId, event, ...metadata };

  // Send IN_APP always
  await dispatchNotification({ userId, type: `ORDER_${event}`, title: notif.title, message: notif.message, channel: 'IN_APP', metadata: meta });

  // Send SMS for critical events
  const smsEvents: string[] = ['DISPATCHED', 'DELIVERED', 'PAYMENT_VERIFIED'];
  if (smsEvents.includes(event)) {
    await dispatchNotification({ userId, type: `ORDER_${event}`, title: notif.title, message: notif.message, channel: 'SMS', metadata: meta });
  }
}
