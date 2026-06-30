import db from './connection.js';

/**
 * Runs `fn(trx)` inside a transaction with the Postgres session variables
 * that the RLS policies (migration 0011) key off of:
 *
 *   app.current_tenant_id    — the tenant the request is scoped to
 *   app.is_platform_admin    — 'true' bypasses RLS entirely (SUPER_ADMIN/SUPPORT_AGENT)
 *
 * Every resolver that touches a tenant-scoped table should go through
 * this helper instead of querying `db` directly, so a bug in resolver
 * logic can't accidentally leak cross-tenant rows — the database itself
 * refuses to return them.
 *
 * @param {{ tenantId: string|null, isPlatformAdmin: boolean }} ctx
 * @param {(trx: import('knex').Knex.Transaction) => Promise<any>} fn
 */
export async function withTenant(ctx, fn) {
  return db.transaction(async (trx) => {
    await trx.raw('SET LOCAL app.current_tenant_id = ?', [ctx.tenantId || '']);
    await trx.raw('SET LOCAL app.is_platform_admin = ?', [ctx.isPlatformAdmin ? 'true' : 'false']);
    return fn(trx);
  });
}

/**
 * Builds the RLS context object from an authenticated request user.
 * Centralized here so the "which roles bypass RLS" rule lives in one place.
 */
export function rlsContextFromUser(user) {
  if (!user) return { tenantId: null, isPlatformAdmin: false };
  const isPlatformAdmin = user.role === 'SUPER_ADMIN' || user.role === 'SUPPORT_AGENT';
  return { tenantId: user.tenantId || null, isPlatformAdmin };
}
