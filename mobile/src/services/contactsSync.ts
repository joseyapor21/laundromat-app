import * as Contacts from 'expo-contacts';
import * as SecureStore from 'expo-secure-store';
import type { Customer } from '../types';

const LAUNDROMAT_TAG = '[Laundromat Customer]';
const SYNCED_PHONES_KEY = 'synced_contact_phones';

// Request contacts permission — returns true if granted or limited (iOS 18+)
async function requestPermission(): Promise<boolean> {
  const existing = await Contacts.getPermissionsAsync();
  const existingOk = existing.status === 'granted' || (existing as any).accessPrivileges === 'limited';
  if (existingOk) return true;
  if (existing.status === 'denied') {
    console.log('[ContactsSync] Permission denied — skipping sync');
    return false;
  }
  const result = await Contacts.requestPermissionsAsync();
  const granted = result.status === 'granted' || (result as any).accessPrivileges === 'limited';
  console.log('[ContactsSync] Permission status:', result.status, (result as any).accessPrivileges);
  return granted;
}

// Normalize phone for comparison (digits only)
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

// Split full name into firstName and lastName for iOS contacts
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

// Load the set of already-synced phone numbers from storage
async function loadSyncedPhones(): Promise<Set<string>> {
  try {
    const stored = await SecureStore.getItemAsync(SYNCED_PHONES_KEY);
    if (stored) return new Set(JSON.parse(stored));
  } catch {}
  return new Set();
}

// Save the set of synced phone numbers to storage
async function saveSyncedPhones(phones: Set<string>): Promise<void> {
  try {
    await SecureStore.setItemAsync(SYNCED_PHONES_KEY, JSON.stringify([...phones]));
  } catch {}
}

// Delete all Laundromat-synced contacts and clear cache
export async function deleteAllSyncedContacts(): Promise<number> {
  const granted = await requestPermission();
  if (!granted) return 0;

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Note, Contacts.Fields.Company],
  });

  let deleted = 0;
  for (const contact of data) {
    if ((contact.company?.includes(LAUNDROMAT_TAG) || contact.note?.includes(LAUNDROMAT_TAG)) && contact.id) {
      try {
        await Contacts.removeContactAsync(contact.id);
        deleted++;
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch {}
    }
  }

  // Clear the sync cache
  await clearContactsSyncCache();
  console.log(`[ContactsSync] Deleted ${deleted} synced contacts`);
  return deleted;
}

// Save a single customer to iPhone contacts (used when creating new customers)
export async function saveCustomerToContacts(
  customer: Pick<Customer, 'name' | 'phoneNumber' | 'address' | 'email' | 'notes'>
): Promise<'created' | 'updated' | 'skipped'> {
  const granted = await requestPermission();
  if (!granted) return 'skipped';
  if (!customer.phoneNumber) return 'skipped';
  if (!customer.name?.trim()) return 'skipped';

  const normalized = normalizePhone(customer.phoneNumber);
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name, Contacts.Fields.Note, Contacts.Fields.Company],
  });

  const existing = data.find(c =>
    c.phoneNumbers?.some(pn => pn.number && normalizePhone(pn.number) === normalized)
  ) || null;

  const { firstName, lastName } = splitName(customer.name);
  const contactData: Contacts.Contact = {
    contactType: Contacts.ContactTypes.Person,
    firstName,
    lastName,
    phoneNumbers: [{ number: customer.phoneNumber, label: 'mobile' }],
    note: customer.notes?.trim() || '',
    company: LAUNDROMAT_TAG,
  };
  if (customer.email) contactData.emails = [{ email: customer.email, label: 'work' }];
  if (customer.address) contactData.addresses = [{ street: customer.address, label: 'home' }];

  if (existing?.id) {
    if (existing.company?.includes(LAUNDROMAT_TAG) || existing.note?.includes(LAUNDROMAT_TAG)) {
      await Contacts.updateContactAsync({ ...contactData, id: existing.id });
      return 'updated';
    }
    return 'skipped';
  }

  await Contacts.addContactAsync(contactData);

  // Mark as synced
  const synced = await loadSyncedPhones();
  synced.add(normalized);
  await saveSyncedPhones(synced);

  return 'created';
}

// Sync all customers to contacts — only adds customers not yet synced
// Skips customers without a name or phone number
export async function syncAllCustomersToContacts(
  customers: Pick<Customer, 'name' | 'phoneNumber' | 'address' | 'email' | 'notes'>[]
): Promise<{ added: number; skipped: number }> {
  const granted = await requestPermission();
  if (!granted) return { added: 0, skipped: 0 };

  // Load already-synced phones — skip those entirely (no native calls needed)
  const syncedPhones = await loadSyncedPhones();

  const newCustomers = customers.filter(c => {
    if (!c.phoneNumber) return false;
    if (!c.name?.trim()) return false; // Skip customers without a name
    return !syncedPhones.has(normalizePhone(c.phoneNumber));
  });

  console.log(`[ContactsSync] ${newCustomers.length} new customers to add, ${customers.length - newCustomers.length} already synced`);
  if (newCustomers.length === 0) return { added: 0, skipped: customers.length };

  let added = 0;
  let skipped = customers.length - newCustomers.length;

  for (let i = 0; i < newCustomers.length; i++) {
    const customer = newCustomers[i];
    const normalized = normalizePhone(customer.phoneNumber!);

    const { firstName, lastName } = splitName(customer.name);
    const contactData: Contacts.Contact = {
      contactType: Contacts.ContactTypes.Person,
      firstName,
      lastName,
      phoneNumbers: [{ number: customer.phoneNumber!, label: 'mobile' }],
      note: (customer as any).notes?.trim() || '',
      company: LAUNDROMAT_TAG,
    };
    if (customer.email) contactData.emails = [{ email: customer.email, label: 'work' }];
    if (customer.address) contactData.addresses = [{ street: customer.address, label: 'home' }];

    try {
      await Contacts.addContactAsync(contactData);
      added++;
      syncedPhones.add(normalized);
      await saveSyncedPhones(syncedPhones);
    } catch {
      syncedPhones.add(normalized);
      await saveSyncedPhones(syncedPhones);
      skipped++;
    }

    // Small pause between contacts to avoid iOS watchdog kill
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  await saveSyncedPhones(syncedPhones);
  return { added, skipped };
}

// Clear sync cache (call when logging out so a fresh login re-syncs)
export async function clearContactsSyncCache(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SYNCED_PHONES_KEY);
  } catch {}
}
