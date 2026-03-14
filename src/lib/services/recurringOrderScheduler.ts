/**
 * Recurring Order Scheduler - Automatically creates orders for customers with recurring schedules
 * Runs every hour when the server is active
 */

import { connectDB } from '@/lib/db/connection';
import { Customer, Order, ActivityLog, getNextOrderSequence } from '@/lib/db/models';
import type { CustomerDoc } from '@/lib/db/models/Customer';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

/**
 * Start the recurring order checker interval
 */
export function startRecurringOrderChecker() {
  if (intervalId) {
    console.log('[RecurringOrders] Already running');
    return;
  }

  console.log('[RecurringOrders] Starting recurring order checker (every 1 hour)');

  // Run after a short delay to let DB connect
  setTimeout(() => {
    generateRecurringOrders();
  }, 45000);

  // Then run every hour
  intervalId = setInterval(() => {
    generateRecurringOrders();
  }, CHECK_INTERVAL_MS);
}

/**
 * Stop the recurring order checker
 */
export function stopRecurringOrderChecker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[RecurringOrders] Stopped');
  }
}

/**
 * Generate recurring orders for today
 */
async function generateRecurringOrders() {
  if (isRunning) {
    console.log('[RecurringOrders] Skipping - already running');
    return;
  }

  isRunning = true;
  console.log('[RecurringOrders] Checking for recurring orders...');

  try {
    await connectDB();

    const now = new Date();
    const todayDayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
    const todayDateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // Find customers with enabled recurring schedules that have today as a pickup day
    const customers = await Customer.find({
      'recurringSchedule.enabled': true,
      'recurringSchedule.pickupDays': todayDayOfWeek,
    }).lean() as CustomerDoc[];

    if (customers.length === 0) {
      console.log('[RecurringOrders] No recurring orders scheduled for today');
      return;
    }

    console.log(`[RecurringOrders] Found ${customers.length} customers with recurring pickup today`);

    let createdCount = 0;

    for (const customer of customers) {
      try {
        // Check if we already generated an order for this customer today
        const lastGenDate = customer.recurringSchedule?.lastGeneratedDate;
        if (lastGenDate) {
          const lastGenStr = new Date(lastGenDate).toISOString().split('T')[0];
          if (lastGenStr === todayDateStr) {
            continue; // Already generated today
          }
        }

        // Also check if there's already an active (non-completed/archived) order for this customer
        const existingActiveOrder = await Order.findOne({
          customerId: customer._id.toString(),
          isRecurring: true,
          status: { $nin: ['completed', 'archived', 'cancelled'] },
          deletedAt: null,
        });

        if (existingActiveOrder) {
          continue; // Already has an active recurring order
        }

        // Calculate delivery date based on delivery days
        let deliveryDate = new Date(now);
        deliveryDate.setDate(deliveryDate.getDate() + 1); // Default: next day

        if (customer.recurringSchedule?.deliveryDays?.length) {
          // Find the next delivery day
          for (let i = 1; i <= 7; i++) {
            const checkDate = new Date(now);
            checkDate.setDate(checkDate.getDate() + i);
            if (customer.recurringSchedule.deliveryDays.includes(checkDate.getDay())) {
              deliveryDate = checkDate;
              break;
            }
          }
        }

        // Generate order
        const timestamp = Date.now().toString();
        const orderId = await getNextOrderSequence(customer.locationId?.toString());

        const recurringNotes = customer.recurringSchedule?.notes || '';
        const specialInstructions = [customer.notes, recurringNotes]
          .filter(Boolean)
          .join('\n')
          .trim();

        const newOrder = new Order({
          id: timestamp,
          orderId,
          locationId: customer.locationId,
          customerId: customer._id.toString(),
          customerName: customer.name,
          customerPhone: customer.phoneNumber,
          items: [],
          bags: [],
          weight: 0,
          dropOffDate: now,
          estimatedPickupDate: deliveryDate,
          specialInstructions,
          status: 'new_order',
          employeeId: '',
          totalAmount: 0,
          subtotal: 0,
          orderType: customer.address ? 'delivery' : 'storePickup',
          deliveryType: customer.address ? 'full' : undefined,
          deliveryFee: customer.address ? parseFloat(customer.deliveryFee?.replace('$', '') || '0') : 0,
          paymentStatus: 'pending',
          isPaid: false,
          isRecurring: true,
          recurringSourceCustomerId: customer._id.toString(),
          statusHistory: [{
            status: 'new_order',
            changedBy: 'Recurring Schedule',
            changedAt: now,
            notes: 'Auto-created from recurring schedule',
          }],
        });

        await newOrder.save();

        // Update lastGeneratedDate on customer
        await Customer.updateOne(
          { _id: customer._id },
          { $set: { 'recurringSchedule.lastGeneratedDate': now } }
        );

        createdCount++;
        console.log(`[RecurringOrders] Created order #${orderId} for ${customer.name}`);
      } catch (err) {
        console.error(`[RecurringOrders] Failed to create order for ${customer.name}:`, err);
      }
    }

    console.log(`[RecurringOrders] Created ${createdCount} recurring orders`);

    // Log the activity
    if (createdCount > 0) {
      try {
        await ActivityLog.create({
          userId: 'system',
          userName: 'Recurring Order Scheduler',
          action: 'recurring_orders_generated',
          entityType: 'order',
          entityId: 'scheduled',
          details: `Auto-generated ${createdCount} recurring orders`,
          metadata: {
            triggeredBy: 'scheduler',
            ordersCreated: createdCount,
            dayOfWeek: todayDayOfWeek,
          },
          ipAddress: 'server',
          userAgent: 'RecurringOrderScheduler',
        });
      } catch (logError) {
        console.error('[RecurringOrders] Failed to log activity:', logError);
      }
    }
  } catch (error) {
    console.error('[RecurringOrders] Error:', error);
  } finally {
    isRunning = false;
  }
}
