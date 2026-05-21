import crypto from 'crypto';

// AES-256-GCM encryption for sensitive card data
// Key should be 32 bytes (256 bits) stored in environment variable

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;

// Get encryption key from environment or generate one
function getEncryptionKey(): Buffer {
  const key = process.env.CARD_ENCRYPTION_KEY;
  
  if (!key) {
    console.warn('WARNING: CARD_ENCRYPTION_KEY not set. Using derived key from JWT_SECRET.');
    // Fallback: derive from JWT_SECRET (not recommended for production)
    const jwtSecret = process.env.JWT_SECRET || 'orbicorp-default-secret';
    return crypto.scryptSync(jwtSecret, 'orbicorp-card-salt', 32);
  }
  
  // Key should be 64 hex characters (32 bytes)
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }
  
  // Otherwise derive from the provided key
  return crypto.scryptSync(key, 'orbicorp-card-salt', 32);
}

/**
 * Encrypt sensitive data (card number, CVV)
 * Returns: base64 string containing IV + AuthTag + Ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Combine: IV (16) + AuthTag (16) + Ciphertext
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'hex')
  ]);
  
  return combined.toString('base64');
}

/**
 * Decrypt sensitive data
 * Input: base64 string from encrypt()
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, 'base64');
  
  // Extract parts
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString('utf8');
}

/**
 * Mask card number for display (show only last 4)
 * Input: "4532123456789012"
 * Output: "•••• •••• •••• 9012"
 */
export function maskCardNumber(cardNumber: string): string {
  const cleaned = cardNumber.replace(/\s/g, '');
  if (cleaned.length < 4) return '••••';
  
  const last4 = cleaned.slice(-4);
  return `•••• •••• •••• ${last4}`;
}

/**
 * Extract last 4 digits from card number
 */
export function getLast4(cardNumber: string): string {
  const cleaned = cardNumber.replace(/\s/g, '');
  return cleaned.slice(-4);
}

/**
 * Validate card number using Luhn algorithm
 */
export function validateCardNumber(cardNumber: string): boolean {
  const cleaned = cardNumber.replace(/\s/g, '');
  
  if (!/^\d{13,19}$/.test(cleaned)) {
    return false;
  }
  
  let sum = 0;
  let isEven = false;
  
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i], 10);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
}

/**
 * Validate CVV
 */
export function validateCVV(cvv: string): boolean {
  return /^\d{3,4}$/.test(cvv);
}

/**
 * Validate expiry date
 */
export function validateExpiry(month: number, year: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  // Year should be 2 or 4 digits
  const fullYear = year < 100 ? 2000 + year : year;
  
  if (fullYear < currentYear) return false;
  if (fullYear === currentYear && month < currentMonth) return false;
  if (month < 1 || month > 12) return false;
  
  return true;
}

/**
 * Generate a secure random key for CARD_ENCRYPTION_KEY env var
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
