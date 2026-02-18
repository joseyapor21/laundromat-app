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
  isClockedIn?: boolean;
  locationId?: string;
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

interface GetUsersOptions {
  requireClockedIn?: boolean;  // Only return users who are clocked in
  locationId?: string;         // Only return users at this location
}

/**
 * Get all users with push tokens (for broadcasting)
 * Merges users from both auth database and app User model
 * Only returns users who have push notifications enabled
 *
 * Notification rules:
 * - Admins (admin, super_admin) receive ALL notifications regardless of clock-in or location
 * - Regular employees only receive notifications if clocked in AND at the same location
 */
export async function getUsersWithPushTokens(options: GetUsersOptions = {}): Promise<UserWithToken[]> {
  const { requireClockedIn = true, locationId } = options;  // Default to requiring clock-in
  const usersMap = new Map<string, UserWithToken>();

  // Get users from app User model (these have proper roles)
  // Only include users who have notifications enabled (default true for backwards compatibility)
  try {
    await connectDB();

    // Base query for all users with push tokens
    const baseQuery: any = {
      pushToken: { $ne: null, $exists: true },
      isActive: true,
      $or: [
        { pushNotificationsEnabled: true },
        { pushNotificationsEnabled: { $exists: false } }, // Default to enabled for existing users
      ],
    };

    // Query for admins - they receive ALL notifications without clock-in or location filter
    const adminQuery = {
      ...baseQuery,
      role: { $in: ['admin', 'super_admin'] },
    };

    // Query for regular employees - require clock-in and location filter
    const employeeQuery: any = {
      ...baseQuery,
      role: { $nin: ['admin', 'super_admin'] },
    };

    // Add clock-in filter for employees if required
    if (requireClockedIn) {
      employeeQuery.isClockedIn = true;
    }

    // Add location filter for employees if specified
    if (locationId) {
      employeeQuery.currentLocationId = locationId;
    }

    // Get admins (no clock-in or location filter)
    const adminUsers = await User.find(adminQuery)
      .select('_id pushToken email role isClockedIn currentLocationId')
      .lean();

    for (const u of adminUsers) {
      if (u.pushToken) {
        usersMap.set(u.email.toLowerCase(), {
          _id: u._id.toString(),
          pushToken: u.pushToken,
          email: u.email,
          role: u.role,
          isClockedIn: u.isClockedIn,
          locationId: u.currentLocationId?.toString(),
        });
      }
    }

    // Get regular employees (with clock-in and location filters)
    const employeeUsers = await User.find(employeeQuery)
      .select('_id pushToken email role isClockedIn currentLocationId')
      .lean();

    for (const u of employeeUsers) {
      if (u.pushToken && !usersMap.has(u.email.toLowerCase())) {
        usersMap.set(u.email.toLowerCase(), {
          _id: u._id.toString(),
          pushToken: u.pushToken,
          email: u.email,
          role: u.role,
          isClockedIn: u.isClockedIn,
          locationId: u.currentLocationId?.toString(),
        });
      }
    }
  } catch (e) {
    console.error('Error getting app users:', e);
  }

  // Get users from auth database (fallback for users not in app model)
  // Only include users who have notifications enabled
  // Note: Auth database users won't have clock-in status, so they're skipped when requireClockedIn is true
  if (!requireClockedIn) {
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
  }

  return Array.from(usersMap.values());
}

/**
 * Get drivers with push tokens
 * Only returns users with driver access who have push notifications enabled
 *
 * Notification rules:
 * - Admins receive ALL driver notifications regardless of clock-in or location
 * - Regular drivers only receive notifications if clocked in AND at the same location
 */
export async function getDriversWithPushTokens(options: GetUsersOptions = {}): Promise<UserWithToken[]> {
  const { requireClockedIn = true, locationId } = options;  // Default to requiring clock-in
  const usersMap = new Map<string, UserWithToken>();

  try {
    await connectDB();

    const baseQuery: any = {
      pushToken: { $ne: null, $exists: true },
      isActive: true,
      $or: [
        { pushNotificationsEnabled: true },
        { pushNotificationsEnabled: { $exists: false } }, // Default to enabled for existing users
      ],
    };

    // Query for admins - they receive ALL notifications without clock-in or location filter
    const adminQuery = {
      ...baseQuery,
      role: { $in: ['admin', 'super_admin'] },
    };

    // Query for regular drivers - require clock-in and location filter
    const driverQuery: any = {
      ...baseQuery,
      isDriver: true,
      role: { $nin: ['admin', 'super_admin'] },
    };

    // Add clock-in filter for drivers if required
    if (requireClockedIn) {
      driverQuery.isClockedIn = true;
    }

    // Add location filter for drivers if specified
    if (locationId) {
      driverQuery.currentLocationId = locationId;
    }

    // Get admins (no clock-in or location filter)
    const adminUsers = await User.find(adminQuery)
      .select('_id pushToken email role isDriver isClockedIn currentLocationId')
      .lean();

    for (const u of adminUsers) {
      if (u.pushToken) {
        usersMap.set(u.email.toLowerCase(), {
          _id: u._id.toString(),
          pushToken: u.pushToken,
          email: u.email,
          role: u.role,
          isClockedIn: u.isClockedIn,
          locationId: u.currentLocationId?.toString(),
        });
      }
    }

    // Get regular drivers (with clock-in and location filters)
    const driverUsers = await User.find(driverQuery)
      .select('_id pushToken email role isDriver isClockedIn currentLocationId')
      .lean();

    for (const u of driverUsers) {
      if (u.pushToken && !usersMap.has(u.email.toLowerCase())) {
        usersMap.set(u.email.toLowerCase(), {
          _id: u._id.toString(),
          pushToken: u.pushToken,
          email: u.email,
          role: u.role,
          isClockedIn: u.isClockedIn,
          locationId: u.currentLocationId?.toString(),
        });
      }
    }

    return Array.from(usersMap.values());
  } catch (e) {
    console.error('Error getting drivers:', e);
    return [];
  }
}

interface NotifyOptions {
  excludeUserId?: string;
  locationId?: string;  // Filter notifications to users at this location
}

/**
 * Notify all staff about an order status change
 * Only notifies users who are clocked in (and optionally at the specified location)
 */
export async function notifyOrderStatusChange(
  orderId: string,
  orderNumber: number,
  customerName: string,
  newStatus: string,
  options: NotifyOptions = {}
): Promise<void> {
  try {
    const { excludeUserId, locationId } = options;
    const users = await getUsersWithPushTokens({ requireClockedIn: true, locationId });
    const statusLabel = STATUS_LABELS[newStatus] || newStatus.replace(/_/g, ' ');

    // Filter out the user who made the change
    const recipients = excludeUserId
      ? users.filter(u => u._id !== excludeUserId)
      : users;

    if (recipients.length === 0) {
      console.log('No clocked-in users with push tokens to notify (order status change)');
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

    console.log(`Sending ${messages.length} push notifications for order #${orderNumber} (clocked-in users only)`);
    await sendPushNotifications(messages);
  } catch (error) {
    console.error('Error notifying order status change:', error);
  }
}

/**
 * Notify all staff about a new order
 * Only notifies users who are clocked in (and optionally at the specified location)
 */
export async function notifyNewOrder(
  orderId: string,
  orderNumber: number,
  customerName: string,
  orderType: 'storePickup' | 'delivery',
  options: NotifyOptions = {}
): Promise<void> {
  try {
    const { excludeUserId, locationId } = options;
    const users = await getUsersWithPushTokens({ requireClockedIn: true, locationId });
    const typeLabel = orderType === 'delivery' ? 'Delivery' : 'In-Store';

    // Filter out the user who created the order
    const recipients = excludeUserId
      ? users.filter(u => u._id !== excludeUserId)
      : users;

    if (recipients.length === 0) {
      console.log('No clocked-in users with push tokens to notify (new order)');
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

    console.log(`Sending ${messages.length} push notifications for new order #${orderNumber} (clocked-in users only)`);
    await sendPushNotifications(messages);
  } catch (error) {
    console.error('Error notifying new order:', error);
  }
}

/**
 * Notify about machine check
 * Only notifies users who are clocked in (and optionally at the specified location)
 */
export async function notifyMachineChecked(
  orderId: string,
  orderNumber: number,
  machineName: string,
  checkedByInitials: string,
  options: NotifyOptions = {}
): Promise<void> {
  try {
    const { excludeUserId, locationId } = options;
    const users = await getUsersWithPushTokens({ requireClockedIn: true, locationId });

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
 * Only notifies users who are clocked in (and optionally at the specified location)
 */
export async function notifyPaymentReceived(
  orderId: string,
  orderNumber: number,
  customerName: string,
  amount: number,
  paymentMethod: string,
  options: NotifyOptions = {}
): Promise<void> {
  try {
    const { excludeUserId, locationId } = options;
    const users = await getUsersWithPushTokens({ requireClockedIn: true, locationId });

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
 * Only notifies drivers who are clocked in (and optionally at the specified location)
 */
export async function notifyDriversForDelivery(
  orderId: string,
  orderNumber: number,
  customerName: string,
  customerAddress: string,
  options: NotifyOptions = {}
): Promise<void> {
  try {
    const { excludeUserId, locationId } = options;
    const drivers = await getDriversWithPushTokens({ requireClockedIn: true, locationId });

    const recipients = excludeUserId
      ? drivers.filter(u => u._id !== excludeUserId)
      : drivers;

    if (recipients.length === 0) {
      console.log('No clocked-in drivers with push tokens to notify');
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

    console.log(`Notifying ${messages.length} clocked-in drivers about delivery order #${orderNumber}`);
    await sendPushNotifications(messages);
  } catch (error) {
    console.error('Error notifying drivers for delivery:', error);
  }
}

/**
 * Notify about order pickup (customer picked up or driver picked up for delivery)
 * Only notifies users who are clocked in (and optionally at the specified location)
 */
export async function notifyOrderPickedUp(
  orderId: string,
  orderNumber: number,
  customerName: string,
  isDelivery: boolean,
  options: NotifyOptions = {}
): Promise<void> {
  try {
    const { excludeUserId, locationId } = options;
    const users = await getUsersWithPushTokens({ requireClockedIn: true, locationId });

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
