import * as Contacts from 'expo-contacts';
import type { Customer } from '../types';

const LAUNDROMAT_NOTE = '[Laundromat Customer]';

// Request contacts permission — returns true if granted
async function requestPermission(): Promise<boolean> {
  const { status } = await Contacts.requestPermissionsAsync();
  return status === 'granted';
}

// Normalize phone for comparison (digits only)
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

// Save a single customer to iPhone contacts
// Returns 'created' | 'updated' | 'skipped'
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
  return 'created';
}

// Sync all customers to contacts — fetches contacts once, then processes all in memory
// Returns counts of added / skipped
export async function syncAllCustomersToContacts(
  customers: Pick<Customer, 'name' | 'phoneNumber' | 'address' | 'email'>[]
): Promise<{ added: number; skipped: number }> {
  const granted = await requestPermission();
  if (!granted) return { added: 0, skipped: 0 };

  // Fetch all contacts once and build a phone→contact map
  const { data: allContacts } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name, Contacts.Fields.Note],
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
  let skipped = 0;
  const BATCH_SIZE = 10;

  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i];
    if (!customer.phoneNumber) { skipped++; continue; }
    const normalized = normalizePhone(customer.phoneNumber);

    const contactData: Contacts.Contact = {
      contactType: Contacts.ContactTypes.Person,
      name: customer.name,
      phoneNumbers: [{ number: customer.phoneNumber, label: 'mobile' }],
      note: LAUNDROMAT_NOTE,
    };
    if (customer.email) contactData.emails = [{ email: customer.email, label: 'work' }];
    if (customer.address) contactData.addresses = [{ street: customer.address, label: 'home' }];

    const existing = phoneMap.get(normalized);
    if (existing?.id) {
      if (existing.note?.includes(LAUNDROMAT_NOTE)) {
        await Contacts.updateContactAsync({ ...contactData, id: existing.id });
        phoneMap.set(normalized, { ...contactData, id: existing.id });
      } else {
        skipped++;
      }
    } else {
      await Contacts.addContactAsync(contactData);
      added++;
    }

    // Pause every BATCH_SIZE writes to avoid overwhelming the native bridge
    if ((i + 1) % BATCH_SIZE === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return { added, skipped };
}
