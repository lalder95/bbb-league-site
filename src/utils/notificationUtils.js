/**
 * notificationUtils.js
 *
 * Server-only utility for creating per-user notifications.
 * Import and call `createNotification` from API routes or server actions
 * whenever you want to deliver a notification to a user.
 *
 * Usage:
 *   import { createNotification } from '@/utils/notificationUtils';
 *   await createNotification('lalder', {
 *     title: 'Trade offer received',
 *     message: 'aintEZBNwheezE sent you a trade offer.',
 *     link: '/trade-block',   // optional
 *     type: 'system',         // optional, defaults to 'system'
 *   });
 *
 * The function:
 *   1. Inserts a notification record into the `notifications` collection.
 *   2. Fetches any saved push subscriptions for the user.
 *   3. Fires Web Push (VAPID) to each subscription — requires VAPID_PUBLIC_KEY,
 *      VAPID_PRIVATE_KEY, and VAPID_EMAIL env vars. Push is best-effort; failure
 *      does not prevent DB insertion from succeeding.
 *
 * Returns: { success: true, notificationId } or { success: false, error }
 */

import webpush from 'web-push';
import {
  createNotificationRecord,
  markNotificationPushed,
  getPushSubscriptionsForUser,
  getNotificationPreferences,
} from '@/lib/db-helpers';

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = process.env;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_EMAIL) {
    webpush.setVapidDetails(`mailto:${VAPID_EMAIL}`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  }
}

/**
 * Create a notification for a single user and optionally deliver it via push.
 *
 * @param {string} userId - The username (session.user.username) to notify.
 * @param {{ title: string, message: string, link?: string, type?: string, prefKey?: string }} options
 * @returns {Promise<{ success: boolean, notificationId?: string, error?: string }>}
 */
export async function createNotification(userId, { title, message, link = null, type = 'system', prefKey = null } = {}) {
  if (!userId || !title || !message) {
    return { success: false, error: 'userId, title, and message are required' };
  }

  // Respect per-user notification preference if a prefKey is provided
  if (prefKey) {
    try {
      const prefs = await getNotificationPreferences(userId);
      // Default is enabled; only skip if explicitly set to false
      if (prefs[prefKey] === false) {
        return { success: true, skipped: true };
      }
    } catch {
      // On error, proceed with delivery (fail open)
    }
  }

  const result = await createNotificationRecord({ userId, title, message, link, type });
  if (!result.success) return result;

  const { notificationId } = result;

  // Best-effort push delivery — do not await inside a try/catch that would hide the DB success
  sendPushNotification(userId, { title, message, link, notificationId }).catch(() => {});

  return { success: true, notificationId };
}

/**
 * Create the same notification for multiple users at once.
 *
 * @param {string[]} userIds - Array of usernames.
 * @param {{ title: string, message: string, link?: string, type?: string, prefKey?: string }} options
 * @returns {Promise<{ created: number, errors: number }>}
 */
export async function createNotificationForMany(userIds, options) {
  let created = 0;
  let errors = 0;
  await Promise.allSettled(
    userIds.map(async (userId) => {
      const r = await createNotification(userId, options);
      if (r.success) created++; else errors++;
    })
  );
  return { created, errors };
}

async function sendPushNotification(userId, { title, message, link, notificationId }) {
  ensureVapidConfigured();
  if (!vapidConfigured) return;

  const subscriptions = await getPushSubscriptionsForUser(userId);
  if (!subscriptions.length) return;

  const payload = JSON.stringify({ title, message, link, notificationId });

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, payload);
        if (notificationId) await markNotificationPushed(notificationId);
      } catch (err) {
        // 404/410 means the subscription is expired — ignore silently
        // Other errors are also swallowed since push is best-effort
      }
    })
  );
}
