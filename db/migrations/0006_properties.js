/**
 * 0006 — Properties
 *
 * tenant_id is NOT NULL here: every property is owned by exactly one
 * franchise tenant. This is the table RLS (0011) protects most
 * aggressively, since it's the main revenue-bearing data.
 */
export async function up(knex) {
  await knex.schema.createTable('properties', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL'); // franchise staff who listed it
    t.uuid('assigned_agent_id').references('id').inTable('users').onDelete('SET NULL');

    t.string('title', 200).notNullable();
    t.text('description');
    t.specificType('listing_type', 'listing_type').notNullable().defaultTo('SALE');
    t.specificType('property_type', 'property_type').notNullable();
    t.specificType('status', 'property_status').notNullable().defaultTo('DRAFT');
    t.text('slug').notNullable().unique();  // URL-friendly, auto-generated from title + id
    t.string('bhk', 20);                      // "2 BHK", null for plots/commercial
    t.decimal('carpet_area_sqft', 10, 2);
    t.decimal('builtup_area_sqft', 10, 2);
    t.bigInteger('price_paise').notNullable();   // store as integer paise to avoid float issues
    t.bigInteger('price_per_sqft_paise');
    t.bigInteger('maintenance_paise');           // monthly maintenance, for rent/apartments

    t.string('possession_status', 40);        // "Ready to Move" | "Under Construction" | "New Launch"
    t.date('possession_date');

    // Location
    t.string('address_line', 300);
    t.string('locality', 150);
    t.string('city', 100).notNullable();
    t.string('state', 100);
    t.string('pincode', 12);
    t.decimal('latitude', 9, 6);
    t.decimal('longitude', 9, 6);

    t.string('builder_name', 200);
    t.decimal('rating', 2, 1).defaultTo(0);

    t.boolean('is_featured').notNullable().defaultTo(false);
    t.boolean('is_verified').notNullable().defaultTo(false);
    t.integer('view_count').notNullable().defaultTo(0);

    t.jsonb('amenities').notNullable().defaultTo('[]');   // ["Swimming Pool","Gym",...]
    t.jsonb('metadata').notNullable().defaultTo('{}');

    t.timestamp('published_at');
    t.timestamps(true, true);
    t.timestamp('deleted_at');
  });

  await knex.schema.alterTable('properties', (t) => {
    t.index(['tenant_id']);
    t.index(['city']);
    t.index(['status']);
    t.index(['property_type']);
    t.index(['listing_type']);
    t.index(['price_paise']);
    t.index(['is_featured']);
  });

  // Full text search across title/description/locality/builder
  await knex.raw(`
    ALTER TABLE properties ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(locality, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(builder_name, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'C')
    ) STORED
  `);
  await knex.raw('CREATE INDEX properties_search_idx ON properties USING GIN (search_vector)');
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('properties');
}
