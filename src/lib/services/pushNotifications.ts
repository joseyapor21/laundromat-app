import { getAuthDatabase } from '@/lib/db/connection';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
}

interface PushResult {
  success: boolean;
  message?: string;
  error?: string;
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
 */
export async function getUsersWithPushTokens(): Promise<{ _id: string; pushToken: string; email: string }[]> {
  const db = await getAuthDatabase();

  const users = await db.collection('users')
    .find({
      pushToken: { $ne: null, $exists: true },
      isActive: true,
    })
    .project({ _id: 1, pushToken: 1, email: 1 })
    .toArray();

  return users.map(u => ({
    _id: u._id.toString(),
    pushToken: u.pushToken,
    email: u.email,
  }));
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
      sound: 'default',
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
