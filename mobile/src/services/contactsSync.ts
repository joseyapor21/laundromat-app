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

// Find an existing contact by phone number
async function findContactByPhone(phone: string): Promise<Contacts.Contact | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name, Contacts.Fields.Note],
  });

  for (const contact of data) {
    if (contact.phoneNumbers) {
      for (const pn of contact.phoneNumbers) {
        if (pn.number && normalizePhone(pn.number) === normalized) {
          return contact;
        }
      }
    }
  }
  return null;
}

// Save a single customer to iPhone contacts
// Returns 'created' | 'updated' | 'skipped'
export async function saveCustomerToContacts(
  customer: Pick<Customer, 'name' | 'phoneNumber' | 'address' | 'email'>
): Promise<'created' | 'updated' | 'skipped'> {
  const granted = await requestPermission();
  if (!granted) return 'skipped';
  if (!customer.phoneNumber) return 'skipped';

  const existing = await findContactByPhone(customer.phoneNumber);

  const contactData: Contacts.Contact = {
    contactType: Contacts.ContactTypes.Person,
    name: customer.name,
    phoneNumbers: [{ number: customer.phoneNumber, label: 'mobile' }],
    note: LAUNDROMAT_NOTE,
  };

  if (customer.email) {
    contactData.emails = [{ email: customer.email, label: 'work' }];
  }

  if (customer.address) {
    contactData.addresses = [{ street: customer.address, label: 'home' }];
  }

  if (existing?.id) {
    // Update existing contact if it was added by us
    if (existing.note?.includes(LAUNDROMAT_NOTE)) {
      await Contacts.updateContactAsync({ ...contactData, id: existing.id });
      return 'updated';
    }
    // Contact exists but wasn't added by us — skip to avoid overwriting
    return 'skipped';
  }

  await Contacts.addContactAsync(contactData);
  return 'created';
}

// Sync all customers to contacts — only adds missing ones
// Returns counts of added / skipped
export async function syncAllCustomersToContacts(
  customers: Pick<Customer, 'name' | 'phoneNumber' | 'address' | 'email'>[]
): Promise<{ added: number; skipped: number }> {
  const granted = await requestPermission();
  if (!granted) return { added: 0, skipped: 0 };

  let added = 0;
  let skipped = 0;

  for (const customer of customers) {
    if (!customer.phoneNumber) { skipped++; continue; }
    const result = await saveCustomerToContacts(customer);
    if (result === 'created') added++;
    else skipped++;
  }

  return { added, skipped };
}
