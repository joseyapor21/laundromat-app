import * as Contacts from 'expo-contacts';
import * as SecureStore from 'expo-secure-store';
import type { Customer } from '../types';

const LAUNDROMAT_NOTE = '[Laundromat Customer]';
const SYNCED_PHONES_KEY = 'synced_contact_phones';

// Request contacts permission — returns true if granted
async function requestPermission(): Promise<boolean> {
  const { status } = await Contacts.requestPermissionsAsync();
  return status === 'granted';
}

// Normalize phone for comparison (digits only)
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
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

// Save a single customer to iPhone contacts (used when creating new customers)
export async function saveCustomerToContacts(
  customer: Pick<Customer, 'name' | 'phoneNumber' | 'address' | 'email'>
): Promise<'created' | 'updated' | 'skipped'> {
  const granted = await requestPermission();
  if (!granted) return 'skipped';
  if (!customer.phoneNumber) return 'skipped';

  const normalized = normalizePhone(customer.phoneNumber);
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name, Contacts.Fields.Note],
  });

  const existing = data.find(c =>
    c.phoneNumbers?.some(pn => pn.number && normalizePhone(pn.number) === normalized)
  ) || null;

  const contactData: Contacts.Contact = {
    contactType: Contacts.ContactTypes.Person,
    name: customer.name,
    phoneNumbers: [{ number: customer.phoneNumber, label: 'mobile' }],
    note: LAUNDROMAT_NOTE,
  };
  if (customer.email) contactData.emails = [{ email: customer.email, label: 'work' }];
  if (customer.address) contactData.addresses = [{ street: customer.address, label: 'home' }];

  if (existing?.id) {
    if (existing.note?.includes(LAUNDROMAT_NOTE)) {
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
// After first run, subsequent runs only process new customers (very fast)
export async function syncAllCustomersToContacts(
  customers: Pick<Customer, 'name' | 'phoneNumber' | 'address' | 'email'>[]
): Promise<{ added: number; skipped: number }> {
  const granted = await requestPermission();
  if (!granted) return { added: 0, skipped: 0 };

  // Load already-synced phones — skip those entirely (no native calls needed)
  const syncedPhones = await loadSyncedPhones();

  const newCustomers = customers.filter(c => {
    if (!c.phoneNumber) return false;
    return !syncedPhones.has(normalizePhone(c.phoneNumber));
  });

  if (newCustomers.length === 0) return { added: 0, skipped: customers.length };

  // Only fetch device contacts if there are new customers to add
  const { data: allContacts } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Note],
  });

  const phoneMap = new Map<string, Contacts.Contact>();
  for (const contact of allContacts) {
    if (contact.phoneNumbers) {
      for (const pn of contact.phoneNumbers) {
        if (pn.number) phoneMap.set(normalizePhone(pn.number), contact);
      }
    }
  }

  let added = 0;
  let skipped = customers.length - newCustomers.length;
  const BATCH_SIZE = 5;

  for (let i = 0; i < newCustomers.length; i++) {
    const customer = newCustomers[i];
    const normalized = normalizePhone(customer.phoneNumber!);

    const contactData: Contacts.Contact = {
      contactType: Contacts.ContactTypes.Person,
      name: customer.name,
      phoneNumbers: [{ number: customer.phoneNumber!, label: 'mobile' }],
      note: LAUNDROMAT_NOTE,
    };
    if (customer.email) contactData.emails = [{ email: customer.email, label: 'work' }];
    if (customer.address) contactData.addresses = [{ street: customer.address, label: 'home' }];

    try {
      const existing = phoneMap.get(normalized);
      if (existing?.id) {
        if (existing.note?.includes(LAUNDROMAT_NOTE)) {
          await Contacts.updateContactAsync({ ...contactData, id: existing.id });
        } else {
          skipped++;
        }
      } else {
        await Contacts.addContactAsync(contactData);
        added++;
      }
      // Mark as synced regardless so we don't retry failures indefinitely
      syncedPhones.add(normalized);
    } catch {
      skipped++;
    }

    // Pause every BATCH_SIZE writes
    if ((i + 1) % BATCH_SIZE === 0) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
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
