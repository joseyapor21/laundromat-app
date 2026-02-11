import { connectDB, getAuthDatabase } from '@/lib/db/connection';
import { User } from '@/lib/db/models';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// TEMPORARY: Disable all push notifications
const PUSH_NOTIFICATIONS_DISABLED = false;

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | 'neworder.wav' | null;
  badge?: number;
  channelId?: string;
}

interface PushResult {
  success: boolean;
  message?: string;
  error?: string;
}

interface UserWithToken {
  _id: string;
  pushToken: string;
  email: string;
  role?: string;
}

// Status labels for notifications
const STATUS_LABELS: Record<string, string> = {
  new_order: 'New Order',
  received: 'Received',
  scheduled_pickup: 'Scheduled Pickup',
  picked_up: 'Picked Up',
  in_washer: 'In Washer',
  in_dryer: 'In Dryer',
  laid_on_cart: 'On Cart',
  folding: 'Folding',
  ready_for_pickup: 'Ready for Pickup',
  ready_for_delivery: 'Ready for Delivery',
  out_for_delivery: 'Out for Delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * Send a push notification via Expo's push notification service
 */
export async function sendPushNotification(message: PushMessage): Promise<PushResult> {
  // TEMPORARY: Push notifications disabled
  if (PUSH_NOTIFICATIONS_DISABLED) {
    console.log('[DISABLED] Push notification skipped:', message.title);
    return { success: true, message: 'Push notifications disabled' };
  }
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();

    if (result.data?.status === 'ok') {
      return { success: true, message: 'Notification sent successfully' };
    }

    return {
      success: false,
      error: result.data?.message || result.errors?.[0]?.message || 'Unknown error',
    };
  } catch (error) {
    console.error('Push notification error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send notification',
    };
  }
}

/**
 * Send push notifications to multiple tokens
 */
export async function sendPushNotifications(messages: PushMessage[]): Promise<PushResult[]> {
  // TEMPORARY: Push notifications disabled
  if (PUSH_NOTIFICATIONS_DISABLED) {
    console.log(`[DISABLED] ${messages.length} push notifications skipped`);
    return messages.map(() => ({ success: true, message: 'Push notifications disabled' }));
  }
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error('Push notifications error:', error);
    return messages.map(() => ({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send notifications',
    }));
  }
}

/**
 * Get all users with push tokens (for broadcasting)
 * Merges users from both auth database and app User model
 * Only returns users who have push notifications enabled
 */
export async function getUsersWithPushTokens(): Promise<UserWithToken[]> {
  const usersMap = new Map<string, UserWithToken>();

  // Get users from app User model (these have proper roles)
  // Only include users who have notifications enabled (default true for backwards compatibility)
  try {
    await connectDB();
    const appUsers = await User.find({
      pushToken: { $ne: null, $exists: true },
      isActive: true,
      $or: [
        { pushNotificationsEnabled: true },
        { pushNotificationsEnabled: { $exists: false } }, // Default to enabled for existing users
      ],
    }).select('_id pushToken email role').lean();

    for (const u of appUsers) {
      if (u.pushToken) {
        usersMap.set(u.email.toLowerCase(), {
          _id: u._id.toString(),
          pushToken: u.pushToken,
          email: u.email,
          role: u.role,
        });
      }
    }
  } catch (e) {
    console.error('Error getting app users:', e);
  }

  // Get users from auth database (fallback for users not in app model)
  // Only include users who have notifications enabled
  try {
    const db = await getAuthDatabase();
    const authUsers = await db.collection('v5users')
      .find({
        pushToken: { $ne: null, $exists: true },
        $or: [
          { pushNotificationsEnabled: true },
          { pushNotificationsEnabled: { $exists: false } }, // Default to enabled
        ],
      })
      .project({ _id: 1, pushToken: 1, email: 1 })
      .toArray();

    for (const u of authUsers) {
      if (u.pushToken && !usersMap.has(u.email?.toLowerCase())) {
        usersMap.set(u.email?.toLowerCase(), {
          _id: u._id.toString(),
          pushToken: u.pushToken,
          email: u.email,
          role: undefined, // Auth users don't have specific roles
        });
      }
    }
  } catch (e) {
    console.error('Error getting auth users:', e);
  }

  return Array.from(usersMap.values());
}

/**
 * Get drivers with push tokens
 * Only returns users with driver access who have push notifications enabled
 */
export async function getDriversWithPushTokens(): Promise<UserWithToken[]> {
  try {
    await connectDB();
    const drivers = await User.find({
      pushToken: { $ne: null, $exists: true },
      isActive: true,
      $or: [
        { isDriver: true },
        { role: { $in: ['admin', 'super_admin'] } }, // Admins always have driver access
      ],
      $and: [
        {
          $or: [
            { pushNotificationsEnabled: true },
            { pushNotificationsEnabled: { $exists: false } }, // Default to enabled for existing users
          ],
        },
      ],
    }).select('_id pushToken email role isDriver').lean();

    return drivers.filter(u => u.pushToken).map(u => ({
      _id: u._id.toString(),
      pushToken: u.pushToken!,
      email: u.email,
      role: u.role,
    }));
  } catch (e) {
    console.error('Error getting drivers:', e);
    return [];
  }
}

/**
 * Notify all staff about an order status change
 */
export async function notifyOrderStatusChange(
  orderId: string,
  orderNumber: number,
  customerName: string,
  newStatus: string,
  excludeUserId?: string
): Promise<void> {
  try {
    const users = await getUsersWithPushTokens();
    const statusLabel = STATUS_LABELS[newStatus] || newStatus.replace(/_/g, ' ');

    // Filter out the user who made the change
    const recipients = excludeUserId
      ? users.filter(u => u._id !== excludeUserId)
      : users;

    if (recipients.length === 0) {
      console.log('No users with push tokens to notify');
      return;
    }

    const messages: PushMessage[] = recipients.map(user => ({
      to: user.pushToken,
      title: `Order #${orderNumber} Updated`,
      body: `${customerName} - Status: ${statusLabel}`,
      data: { orderId, orderNumber, status: newStatus },
      sound: 'default',
      channelId: 'orders',
    }));

    console.log(`Sending ${messages.length} push notifications for order #${orderNumber}`);
    await sendPushNotifications(messages);
  } catch (error) {
    console.error('Error notifying order status change:', error);
  }
}

/**
 * Notify all staff about a new order
 */
export async function notifyNewOrder(
  orderId: string,
  orderNumber: number,
  customerName: string,
  orderType: 'storePickup' | 'delivery',
  excludeUserId?: string
): Promise<void> {
  try {
    const users = await getUsersWithPushTokens();
    const typeLabel = orderType === 'delivery' ? 'Delivery' : 'In-Store';

    // Filter out the user who created the order
    const recipients = excludeUserId
      ? users.filter(u => u._id !== excludeUserId)
      : users;

    if (recipients.length === 0) {
      console.log('No users with push tokens to notify');
      return;
    }

    const messages: PushMessage[] = recipients.map(user => ({
      to: user.pushToken,
      title: `New ${typeLabel} Order #${orderNumber}`,
      body: `Customer: ${customerName}`,
      data: { orderId, orderNumber, type: 'new_order' },
      sound: 'neworder.wav',
      channelId: 'orders',
    }));

    console.log(`Sending ${messages.length} push notifications for new order #${orderNumber}`);
    await sendPushNotifications(messages);
  } catch (error) {
    console.error('Error notifying new order:', error);
  }
}

/**
 * Notify about machine check
 */
export async function notifyMachineChecked(
  orderId: string,
  orderNumber: number,
  machineName: string,
  checkedByInitials: string,
  excludeUserId?: string
): Promise<void> {
  try {
    const users = await getUsersWithPushTokens();

    const recipients = excludeUserId
      ? users.filter(u => u._id !== excludeUserId)
      : users;

    if (recipients.length === 0) return;

    const messages: PushMessage[] = recipients.map(user => ({
      to: user.pushToken,
      title: `Machine Checked - Order #${orderNumber}`,
      body: `${machineName} checked by ${checkedByInitials}`,
      data: { orderId, orderNumber, type: 'machine_checked' },
      sound: 'default',
      channelId: 'orders',
    }));

    await sendPushNotifications(messages);
  } catch (error) {
    console.error('Error notifying machine check:', error);
  }
}

/**
 * Notify about payment received
 */
export async function notifyPaymentReceived(
  orderId: string,
  orderNumber: number,
  customerName: string,
  amount: number,
  paymentMethod: string,
  excludeUserId?: string
): Promise<void> {
  try {
    const users = await getUsersWithPushTokens();

    const recipients = excludeUserId
      ? users.filter(u => u._id !== excludeUserId)
      : users;

    if (recipients.length === 0) return;

    const messages: PushMessage[] = recipients.map(user => ({
      to: user.pushToken,
      title: `Payment Received - Order #${orderNumber}`,
      body: `${customerName} paid $${amount.toFixed(2)} via ${paymentMethod}`,
      data: { orderId, orderNumber, type: 'payment' },
      sound: 'default',
      channelId: 'orders',
    }));

    await sendPushNotifications(messages);
  } catch (error) {
    console.error('Error notifying payment:', error);
  }
}

/**
 * Notify drivers about a delivery order ready for pickup
 */
export async function notifyDriversForDelivery(
  orderId: string,
  orderNumber: number,
  customerName: string,
  customerAddress: string,
  excludeUserId?: string
): Promise<void> {
  try {
    const drivers = await getDriversWithPushTokens();

    const recipients = excludeUserId
      ? drivers.filter(u => u._id !== excludeUserId)
      : drivers;

    if (recipients.length === 0) {
      console.log('No drivers with push tokens to notify');
      return;
    }

    const messages: PushMessage[] = recipients.map(user => ({
      to: user.pushToken,
      title: `Delivery Ready - Order #${orderNumber}`,
      body: `${customerName}\n${customerAddress || 'Address pending'}`,
      data: { orderId, orderNumber, type: 'delivery_ready' },
      sound: 'neworder.wav',
      channelId: 'orders',
    }));

    console.log(`Notifying ${messages.length} drivers about delivery order #${orderNumber}`);
    await sendPushNotifications(messages);
  } catch (error) {
    console.error('Error notifying drivers for delivery:', error);
  }
}

/**
 * Notify about order pickup (customer picked up or driver picked up for delivery)
 */
export async function notifyOrderPickedUp(
  orderId: string,
  orderNumber: number,
  customerName: string,
  isDelivery: boolean,
  excludeUserId?: string
): Promise<void> {
  try {
    const users = await getUsersWithPushTokens();

    const recipients = excludeUserId
      ? users.filter(u => u._id !== excludeUserId)
      : users;

    if (recipients.length === 0) return;

    const title = isDelivery
      ? `Out for Delivery - Order #${orderNumber}`
      : `Order Picked Up - #${orderNumber}`;
    const body = isDelivery
      ? `Driver picked up order for ${customerName}`
      : `${customerName} picked up their order`;

    const messages: PushMessage[] = recipients.map(user => ({
      to: user.pushToken,
      title,
      body,
      data: { orderId, orderNumber, type: isDelivery ? 'out_for_delivery' : 'picked_up' },
      sound: 'neworder.wav',
      channelId: 'orders',
    }));

    await sendPushNotifications(messages);
  } catch (error) {
    console.error('Error notifying order pickup:', error);
  }
}
