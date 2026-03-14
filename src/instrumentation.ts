/**
 * Next.js Instrumentation - runs once when the server starts
 * Used for setting up background tasks like payment checking
 */

export async function register() {
  // Only run on the server (not during build or on edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startPaymentChecker } = await import('./lib/services/paymentScheduler');
    startPaymentChecker();

    const { startRecurringOrderChecker } = await import('./lib/services/recurringOrderScheduler');
    startRecurringOrderChecker();
  }
}
