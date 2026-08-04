import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * Basic strength check kept on the server too (never trust the client-side
 * meter alone). Returns { valid, reasons[] }.
 */
export function checkPasswordStrength(pwd) {
  const reasons = [];
  if (!pwd || pwd.length < 8) reasons.push('At least 8 characters required');
  if (!/[A-Z]/.test(pwd)) reasons.push('Add an uppercase letter');
  if (!/[0-9]/.test(pwd)) reasons.push('Add a number');
  if (!/[^A-Za-z0-9]/.test(pwd)) reasons.push('Add a special character');
  return { valid: reasons.length === 0, reasons };
}
