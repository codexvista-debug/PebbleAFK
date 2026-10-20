import crypto from 'crypto';

export const USERNAME_REGEX = /^[a-zA-Z0-9]{1,16}$/;
export const SALT = '_pebbleafk_salt_secure_bedrock_2026_z91';
export const SECRET_EXTRA_SALT = '_pbb_extra_bedrock_sec';

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + SALT).digest('hex');
}

export function generateSecretCode(username: string, passwordHash: string): string {
  const cleanUser = (username || '').trim().toLowerCase();
  const hash = crypto.createHash('sha256').update(`${cleanUser}:${passwordHash}:${SECRET_EXTRA_SALT}`).digest('hex');
  return `pb_${hash.substring(0, 10)}`;
}
