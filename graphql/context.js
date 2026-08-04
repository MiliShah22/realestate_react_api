import db from '../db/connection.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { rlsContextFromUser } from '../db/withTenant.js';
import { createLoaders } from '../loaders/index.js';
import { GraphQLError } from 'graphql';

/**
 * Builds the per-request context object available to every resolver as
 * the third argument: (parent, args, context).
 *
 * context.user   — decoded JWT claims (id/role/tenantId), or null if anonymous
 * context.rls    — { tenantId, isPlatformAdmin } for withTenant()
 * context.db     — shared Knex instance (only used outside RLS-protected tables)
 * context.loaders — fresh DataLoader instances scoped to this single request
 */
export async function buildContext({ req }) {
  let user = null;

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    try {
      const payload = verifyAccessToken(token);
      user = { id: payload.sub, role: payload.role, tenantId: payload.tenantId };
    } catch (err) {
      // Expired/invalid tokens are treated as "anonymous" rather than hard-failing
      // the whole request — individual resolvers decide if auth is required.
      user = null;
    }
  }

  const rls = rlsContextFromUser(user);

  return {
    user,
    rls,
    db,
    loaders: createLoaders({ rls }),
  };
}

/** Throws a standard UNAUTHENTICATED error if no user is on the context. */
export function requireAuth(ctx) {
  if (!ctx.user) {
    throw new GraphQLError('You must be signed in to perform this action.', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  return ctx.user;
}

/** Throws FORBIDDEN unless the current user's role is in `roles`. */
export function requireRole(ctx, roles) {
  const user = requireAuth(ctx);
  if (!roles.includes(user.role)) {
    throw new GraphQLError(`This action requires one of: ${roles.join(', ')}.`, {
      extensions: { code: 'FORBIDDEN' },
    });
  }
  return user;
}

/** Platform-level roles that bypass tenant scoping entirely. */
export const PLATFORM_ROLES = ['SUPER_ADMIN', 'SUPPORT_AGENT'];
export const FRANCHISE_ROLES = ['FRANCHISE_OWNER', 'FRANCHISE_STAFF'];
