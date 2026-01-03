import { connectDB } from '@/lib/db/connection';
import { Order, Customer } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import DashboardClient from '@/components/DashboardClient';

// Force dynamic rendering to ensure fresh user data on each request
export const dynamic = 'force-dynamic';

async function getInitialData() {
  await connectDB();

  // Get all orders (same as API)
  const orders = await Order.find({})
    .sort({ dropOffDate: -1 })
    .lean();

  // Get unique customer IDs
  const customerIds = [...new Set(orders.map(order => order.customerId))];

  // Fetch customers
  const customers = await Customer.find({
    $or: [
      { _id: { $in: customerIds.filter(id => id.match(/^[0-9a-fA-F]{24}$/)) } },
      { id: { $in: customerIds.map(id => parseInt(id)).filter(id => !isNaN(id)) } },
    ],
  }).lean();

  // Create customer lookup
  const customerMap = new Map();
  customers.forEach(c => {
    customerMap.set(c._id.toString(), c);
    customerMap.set(c.id?.toString(), c);
  });

  // Attach customer data to orders
  const ordersWithCustomers = orders.map(order => ({
    ...order,
    _id: order._id.toString(),
    customer: customerMap.get(order.customerId) || null,
  }));

  return JSON.parse(JSON.stringify(ordersWithCustomers));
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const initialOrders = await getInitialData();

  return (
    <DashboardClient
      initialOrders={initialOrders}
      user={user}
    />
  );
}
