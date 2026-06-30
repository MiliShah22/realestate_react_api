/**
 * 0005 — Verification Tokens
 * Single table covers password-reset links, email-verify links, and
 * phone OTP codes — distinguished by `purpose`.
 */
export async function up(knex) {
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE verification_purpose AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFY', 'PHONE_OTP', 'SIGNUP_OTP');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await knex.schema.createTable('verification_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.specificType('purpose', 'verification_purpose').notNullable();
    t.string('token_hash', 255).notNullable();    // hashed reset token, or hashed OTP
    t.string('contact', 150);                      // email or phone this was sent to (pre-signup case has no user_id yet)
    t.integer('attempts').notNullable().defaultTo(0);
    t.timestamp('expires_at').notNullable();
    t.timestamp('consumed_at');
    t.timestamps(true, true);
  });

  await knex.schema.alterTable('verification_tokens', (t) => {
    t.index(['user_id']);
    t.index(['token_hash']);
    t.index(['contact', 'purpose']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('verification_tokens');
  await knex.raw('DROP TYPE IF EXISTS verification_purpose');
}
