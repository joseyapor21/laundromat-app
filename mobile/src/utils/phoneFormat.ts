/**
 * Format a phone number to (XXX) XXX-XXXX format
 * @param phone - The phone number string (can be any format)
 * @returns Formatted phone number or original string if invalid
 */
export function formatPhoneNumber(phone: string | undefined | null): string {
  if (!phone) return '';

  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Handle 10-digit numbers
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // Handle 11-digit numbers (with leading 1)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  // Return original if not a standard US number
  return phone;
}

/**
 * Format phone number as user types (for input fields)
 * @param phone - The current input value
 * @returns Formatted phone number for display in input
 */
export function formatPhoneInput(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Limit to 10 digits
  const limited = digits.slice(0, 10);

  if (limited.length === 0) return '';
  if (limited.length <= 3) return `(${limited}`;
  if (limited.length <= 6) return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
  return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
}

/**
 * Extract just the digits from a formatted phone number
 * @param phone - The formatted phone number
 * @returns Just the digits
 */
export function unformatPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}
