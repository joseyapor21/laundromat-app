import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// Use environment variable for encryption key
// Generate a key with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const getEncryptionKey = (): Buffer => {
  const key = process.env.VAULT_ENCRYPTION_KEY;
  if (!key) {
    // Fallback to a default key for development (CHANGE IN PRODUCTION!)
    console.warn('WARNING: Using default encryption key. Set VAULT_ENCRYPTION_KEY in production!');
    return Buffer.from('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2', 'hex');
  }
  if (key.length !== 64) {
    throw new Error('VAULT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(key, 'hex');
};

/**
 * Encrypt a plaintext string using AES-256-GCM
 * Returns a string in format: iv:authTag:encryptedData (all hex encoded)
 */
export function encryptPassword(plaintext: string): string {
  if (!plaintext) return '';

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an encrypted string using AES-256-GCM
 * Expects input in format: iv:authTag:encryptedData (all hex encoded)
 */
export function decryptPassword(ciphertext: string): string {
  if (!ciphertext) return '';

  try {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      console.error('Invalid ciphertext format');
      return '';
    }

    const [ivHex, authTagHex, encrypted] = parts;

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
}

/**
 * Check if a string appears to be encrypted (matches expected format)
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  // Format should be: 32-char iv : 32-char authTag : variable encrypted
  return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
}
