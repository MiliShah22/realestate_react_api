/**
 * 0001 — Extensions & shared enum types
 * Enables UUID generation and citext (case-insensitive emails),
 * and declares Postgres ENUMs reused across multiple tables.
 */
export async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');   // gen_random_uuid()
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "citext"');     // case-insensitive email/text

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'SUPPORT_AGENT', 'FRANCHISE_OWNER', 'FRANCHISE_STAFF', 'CUSTOMER');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE tenant_status AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE property_status AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'INACTIVE', 'REJECTED', 'SOLD', 'ARCHIVED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE listing_type AS ENUM ('SALE', 'RENT', 'PG');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE property_type AS ENUM ('APARTMENT', 'VILLA', 'PLOT', 'COMMERCIAL', 'OFFICE', 'PG_ROOM');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE lead_status AS ENUM ('NEW', 'CONTACTED', 'FOLLOW_UP', 'CONVERTED', 'LOST');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE review_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE invoice_status AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
}

export async function down(knex) {
  for (const t of ['invoice_status', 'review_status', 'lead_status', 'property_type', 'listing_type', 'property_status', 'tenant_status', 'user_role']) {
    await knex.raw(`DROP TYPE IF EXISTS ${t}`);
  }
  await knex.raw('DROP EXTENSION IF EXISTS "citext"');
  await knex.raw('DROP EXTENSION IF EXISTS "pgcrypto"');
}
