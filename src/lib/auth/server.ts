import { headers } from 'next/headers';
import type { UserRole } from '@/types';

export interface CurrentUser {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const headersList = await headers();

  const userId = headersList.get('x-user-id');
  const email = headersList.get('x-user-email');
  const role = headersList.get('x-user-role') as UserRole;
  const name = headersList.get('x-user-name');

  if (!userId || !email || !role) {
    return null;
  }

  return { userId, email, role, name: name || '' };
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
