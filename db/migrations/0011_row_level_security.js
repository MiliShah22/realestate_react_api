/**
 * 0011 — Row-Level Security (defense in depth for multi-tenancy)
 *
 * App code always filters by tenant_id, but RLS makes that mandatory at
 * the database level: every query on a tenant-scoped table is
 * automatically constrained to `current_setting('app.current_tenant_id')`
 * for tenant-role connections, UNLESS the session is flagged as a
 * platform admin (`app.is_platform_admin = 'true'`), which bypasses RLS
 * entirely for cross-tenant admin/reporting queries.
 *
 * The app sets these two session variables per-request via
 * `src/db/withTenant.js` based on the authenticated user's role.
 */
const TENANT_TABLES = [
  'properties',
  'property_images',  // via property_id -> properties, handled with a join-based policy below
  'leads',
  'lead_status_events', // via lead_id -> leads
  'reviews',
  'subscriptions',
  'invoices',
  'commission_ledger',
];

export async function up(knex) {
  // Helper: current tenant context as set by the app per-request
  await knex.raw(`
    CREATE OR REPLACE FUNCTION app_current_tenant_id() RETURNS uuid AS $$
      SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    $$ LANGUAGE sql STABLE;
  `);
  await knex.raw(`
    CREATE OR REPLACE FUNCTION app_is_platform_admin() RETURNS boolean AS $$
      SELECT COALESCE(current_setting('app.is_platform_admin', true), 'false')::boolean
    $$ LANGUAGE sql STABLE;
  `);

  // Direct tenant_id tables: properties, leads, reviews, subscriptions, invoices, commission_ledger
  for (const table of ['properties', 'leads', 'reviews', 'subscriptions', 'invoices', 'commission_ledger']) {
    await knex.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`
      CREATE POLICY tenant_isolation_${table} ON ${table}
      USING (app_is_platform_admin() OR tenant_id = app_current_tenant_id())
      WITH CHECK (app_is_platform_admin() OR tenant_id = app_current_tenant_id())
    `);
  }

  // Indirect tables — scope via a join back to the owning tenant-scoped row.
  await knex.raw(`ALTER TABLE property_images ENABLE ROW LEVEL SECURITY`);
  await knex.raw(`
    CREATE POLICY tenant_isolation_property_images ON property_images
    USING (
      app_is_platform_admin() OR
      EXISTS (SELECT 1 FROM properties p WHERE p.id = property_images.property_id AND p.tenant_id = app_current_tenant_id())
    )
  `);

  await knex.raw(`ALTER TABLE lead_status_events ENABLE ROW LEVEL SECURITY`);
  await knex.raw(`
    CREATE POLICY tenant_isolation_lead_status_events ON lead_status_events
    USING (
      app_is_platform_admin() OR
      EXISTS (SELECT 1 FROM leads l WHERE l.id = lead_status_events.lead_id AND l.tenant_id = app_current_tenant_id())
    )
  `);

  // `users` is special: customers/admins have tenant_id IS NULL and must
  // always be visible to themselves; franchise staff are tenant-scoped.
  await knex.raw(`ALTER TABLE users ENABLE ROW LEVEL SECURITY`);
  await knex.raw(`
    CREATE POLICY tenant_isolation_users ON users
    USING (
      app_is_platform_admin()
      OR tenant_id IS NULL
      OR tenant_id = app_current_tenant_id()
    )
  `);
}

export async function down(knex) {
  for (const table of ['lead_status_events', 'property_images', 'commission_ledger', 'invoices', 'subscriptions', 'reviews', 'leads', 'properties', 'users']) {
    await knex.raw(`DROP POLICY IF EXISTS tenant_isolation_${table} ON ${table}`);
    await knex.raw(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
  }
  await knex.raw('DROP FUNCTION IF EXISTS app_is_platform_admin()');
  await knex.raw('DROP FUNCTION IF EXISTS app_current_tenant_id()');
}
