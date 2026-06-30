import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || 'dev_access_secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret';
const ACCESS_TTL  = process.env.JWT_ACCESS_EXPIRES_IN  || '15m';
const REFRESH_TTL = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

/**
 * Access token payload is intentionally small (just identity + role +
 * tenant) since it's decoded on every single GraphQL request.
 */
export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, tenantId: user.tenant_id || null },
    ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

/**
 * Refresh tokens are opaque random strings (not JWTs) whose HASH is stored
 * in `refresh_tokens`. This lets us revoke individual sessions server-side
 * — a JWT refresh token can't be revoked without a blocklist anyway, so
 * we skip that complexity and just use a random token + DB lookup.
 */
export function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry() {
  const days = parseInt(REFRESH_TTL) || 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
