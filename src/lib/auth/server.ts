import { headers } from 'next/headers';
import type { UserRole } from '@/types';

export interface CurrentUser {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
  locationId?: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const headersList = await headers();

  const userId = headersList.get('x-user-id');
  const email = headersList.get('x-user-email');
  const role = headersList.get('x-user-role') as UserRole;
  const name = headersList.get('x-user-name');
  const locationId = headersList.get('x-location-id');

  if (!userId || !email || !role) {
    return null;
  }

  return {
    userId,
    email,
    role,
    name: name || '',
    locationId: locationId || undefined,
  };
}

// Get location ID from current user context
export async function getLocationId(): Promise<string | undefined> {
  const headersList = await headers();
  return headersList.get('x-location-id') || undefined;
}

// Require location ID - throws if not present
export async function requireLocationId(): Promise<string> {
  const locationId = await getLocationId();
  if (!locationId) {
    throw new Error('Location ID required');
  }
  return locationId;
}

export function hasRole(user: CurrentUser | null, allowedRoles: UserRole[]): boolean {
  if (!user) return false;
  return allowedRoles.includes(user.role);
}

export function isAdmin(user: CurrentUser | null): boolean {
  return hasRole(user, ['super_admin', 'admin']);
}

export function isSupervisor(user: CurrentUser | null): boolean {
  // Supervisors are now just admins (supervisor role was removed)
  return hasRole(user, ['super_admin', 'admin']);
}
