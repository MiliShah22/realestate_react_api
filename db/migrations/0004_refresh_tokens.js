/**
 * 0004 — Refresh Tokens
 * Stored server-side (hashed) so individual sessions/devices can be revoked
 * without invalidating every session, and so "logout everywhere" works.
 */
export async function up(knex) {
  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('token_hash', 255).notNullable();
    t.string('device_label', 200);     // "Chrome on MacOS"
    t.string('ip_address', 64);
    t.timestamp('expires_at').notNullable();
    t.timestamp('revoked_at');
    t.timestamps(true, true);
  });

  await knex.schema.alterTable('refresh_tokens', (t) => {
    t.index(['user_id']);
    t.index(['token_hash']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('refresh_tokens');
}
