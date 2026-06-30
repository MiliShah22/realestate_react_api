/**
 * 0002 — Plans & Tenants
 *
 * `plans`   : the SaaS pricing tiers (Starter / Growth / Enterprise).
 * `tenants` : one row per Franchise organisation. This is the anchor
 *             for multi-tenancy — almost every business table below
 *             carries a `tenant_id` FK back to this table, and Postgres
 *             Row-Level Security policies (0011) use it to physically
 *             prevent cross-tenant data leaks even if app code has a bug.
 */
export async function up(knex) {
  await knex.schema.createTable('plans', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('code', 40).notNullable().unique();        // 'starter' | 'growth' | 'enterprise'
    t.string('name', 100).notNullable();
    t.text('description');
    t.integer('price_monthly_paise').notNullable();      // store money as integer paise (₹1 = 100 paise)
    t.integer('price_yearly_paise').notNullable();
    t.integer('max_listings').notNullable().defaultTo(50);
    t.integer('max_staff_seats').notNullable().defaultTo(3);
    t.decimal('commission_rate', 5, 2).notNullable().defaultTo(4.00); // % platform commission on closed deals
    t.jsonb('features').notNullable().defaultTo('[]');    // ["featured_listings","analytics","api_access"]
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('tenants', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 200).notNullable();                  // "Sharma Realty Pvt Ltd"
    t.string('slug', 100).notNullable().unique();          // url-safe, used for subdomain/branding
    t.specificType('billing_email', 'citext').notNullable();
    t.string('phone', 20);
    t.string('gstin', 20);
    t.string('city', 100);
    t.string('logo_url', 500);

    t.uuid('plan_id').references('id').inTable('plans').onDelete('RESTRICT');
    t.specificType('status', 'tenant_status').notNullable().defaultTo('TRIAL');
    t.timestamp('trial_ends_at');
    t.timestamp('current_period_start');
    t.timestamp('current_period_end');
    t.decimal('commission_rate_override', 5, 2);           // per-tenant negotiated rate, overrides plan default

    t.jsonb('settings').notNullable().defaultTo('{}');      // tenant-level feature flags / branding overrides
    t.jsonb('metadata').notNullable().defaultTo('{}');

    t.timestamp('suspended_at');
    t.text('suspension_reason');

    t.timestamps(true, true);
    t.timestamp('deleted_at'); // soft delete
  });

  await knex.schema.alterTable('tenants', (t) => {
    t.index(['status']);
    t.index(['plan_id']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('tenants');
  await knex.schema.dropTableIfExists('plans');
}
