/**
 * 0007 — Property Images & Customer Saves
 */
export async function up(knex) {
  await knex.schema.createTable('property_images', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('property_id').notNullable().references('id').inTable('properties').onDelete('CASCADE');
    t.string('url', 500).notNullable();
    t.string('alt_text', 200);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.boolean('is_cover').notNullable().defaultTo(false);
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('property_images', (t) => t.index(['property_id']));

  // Customers saving properties — customers have no tenant_id, so this
  // join table just links a global user to a tenant-owned property.
  await knex.schema.createTable('saved_properties', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('property_id').notNullable().references('id').inTable('properties').onDelete('CASCADE');
    t.timestamps(true, true);
    t.unique(['user_id', 'property_id']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('saved_properties');
  await knex.schema.dropTableIfExists('property_images');
}
