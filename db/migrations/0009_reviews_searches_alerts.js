/**
 * 0009 — Reviews, Saved Searches & Alerts
 */
export async function up(knex) {
  await knex.schema.createTable('reviews', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.uuid('property_id').notNullable().references('id').inTable('properties').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');

    t.smallint('rating').notNullable(); // 1–5, enforced via CHECK below
    t.text('body').notNullable();
    t.specificType('status', 'review_status').notNullable().defaultTo('PENDING');
    t.uuid('moderated_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('moderated_at');

    t.timestamps(true, true);
  });
  await knex.raw('ALTER TABLE reviews ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5)');
  await knex.schema.alterTable('reviews', (t) => {
    t.index(['tenant_id']);
    t.index(['property_id']);
    t.index(['status']);
    t.unique(['property_id', 'user_id']); // one review per customer per property
  });

  // Saved searches power "alerts" — a saved search + alert toggle means
  // "notify me when something matching this query appears".
  await knex.schema.createTable('saved_searches', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('label', 150);                  // "3 BHK in Whitefield, Bengaluru"
    t.jsonb('query').notNullable();           // serialized filter object {city, bhk, minPrice, maxPrice, propertyType, ...}
    t.boolean('alerts_enabled').notNullable().defaultTo(true);
    t.timestamp('last_notified_at');
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('saved_searches', (t) => t.index(['user_id']));

  await knex.schema.createTable('search_history', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').references('id').inTable('users').onDelete('CASCADE'); // nullable: anonymous searches too
    t.string('session_id', 100);
    t.jsonb('query').notNullable();
    t.integer('result_count');
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('search_history', (t) => {
    t.index(['user_id']);
    t.index(['created_at']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('search_history');
  await knex.schema.dropTableIfExists('saved_searches');
  await knex.schema.dropTableIfExists('reviews');
}
