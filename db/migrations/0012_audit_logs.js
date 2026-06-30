/**
 * 0012 — Audit Log
 * Append-only trail of sensitive actions (status changes, plan changes,
 * suspensions, deletions) for compliance and support debugging.
 */
export async function up(knex) {
  await knex.schema.createTable('audit_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').references('id').inTable('tenants').onDelete('SET NULL');
    t.uuid('actor_id').references('id').inTable('users').onDelete('SET NULL');
    t.string('actor_role', 30);
    t.string('action', 100).notNullable();   // "property.status_changed", "tenant.suspended", ...
    t.string('entity_type', 50).notNullable();
    t.uuid('entity_id');
    t.jsonb('before_state');
    t.jsonb('after_state');
    t.string('ip_address', 64);
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('audit_logs', (t) => {
    t.index(['tenant_id']);
    t.index(['actor_id']);
    t.index(['entity_type', 'entity_id']);
    t.index(['created_at']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('audit_logs');
}
