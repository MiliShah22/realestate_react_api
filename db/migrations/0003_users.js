/**
 * 0003 — Users
 *
 * One unified table for every human in the system: platform admins,
 * franchise staff, and customers. `tenant_id` is NULL for
 * SUPER_ADMIN/SUPPORT_AGENT/CUSTOMER (they aren't scoped to a tenant);
 * it's set for FRANCHISE_OWNER/FRANCHISE_STAFF.
 *
 * Keeping one table (instead of separate `admins`/`customers`/`agents`
 * tables) means auth, sessions, and audit logging stay simple — a single
 * `actor_id` works everywhere.
 */
export async function up(knex) {
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    t.uuid('tenant_id').references('id').inTable('tenants').onDelete('CASCADE');
    t.specificType('role', 'user_role').notNullable();

    t.string('name', 150).notNullable();
    t.specificType('email', 'citext').notNullable();
    t.string('phone', 20);
    t.string('password_hash', 255).notNullable();

    t.string('avatar_url', 500);
    t.string('city', 100);

    t.boolean('email_verified').notNullable().defaultTo(false);
    t.boolean('phone_verified').notNullable().defaultTo(false);
    t.boolean('is_active').notNullable().defaultTo(true);

    t.jsonb('notification_prefs').notNullable().defaultTo(JSON.stringify({
      email_alerts: true, sms_alerts: false, whatsapp_alerts: false, weekly_digest: true,
    }));

    t.timestamp('last_login_at');
    t.timestamps(true, true);
    t.timestamp('deleted_at');
  });

  // Email must be unique within a tenant scope (or globally for non-tenant users).
  // Partial unique indexes implement "unique per tenant, or unique if no tenant".
  await knex.raw(`
    CREATE UNIQUE INDEX users_email_tenant_uniq
    ON users (tenant_id, email)
    WHERE tenant_id IS NOT NULL AND deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX users_email_global_uniq
    ON users (email)
    WHERE tenant_id IS NULL AND deleted_at IS NULL
  `);

  await knex.schema.alterTable('users', (t) => {
    t.index(['tenant_id']);
    t.index(['role']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('users');
}
