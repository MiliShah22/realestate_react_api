/**
 * 0008 — Leads
 *
 * A lead is created whenever a customer enquires about a tenant's property.
 * tenant_id is denormalized onto the lead row (even though it's derivable
 * via property_id) specifically so RLS can filter leads by tenant with a
 * single indexed column instead of a join — this table is read constantly
 * by franchise dashboards.
 */
export async function up(knex) {
  await knex.schema.createTable('leads', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.uuid('property_id').references('id').inTable('properties').onDelete('SET NULL');
    t.uuid('customer_id').references('id').inTable('users').onDelete('SET NULL'); // null if guest enquiry
    t.uuid('assigned_agent_id').references('id').inTable('users').onDelete('SET NULL');

    // Snapshot contact details at time of enquiry (in case customer record changes/is deleted)
    t.string('contact_name', 150).notNullable();
    t.string('contact_email', 150);
    t.string('contact_phone', 20).notNullable();

    t.string('budget_label', 50);             // "₹1.2Cr" free-text display value
    t.integer('budget_paise');                 // normalized for sorting/filtering
    t.string('city', 100);
    t.string('source', 40).notNullable().defaultTo('SEARCH'); // SEARCH | DIRECT | REFERRAL | AD | SOCIAL
    t.text('message');

    t.specificType('status', 'lead_status').notNullable().defaultTo('NEW');
    t.text('internal_notes');

    t.timestamp('contacted_at');
    t.timestamp('converted_at');
    t.timestamps(true, true);
  });

  await knex.schema.alterTable('leads', (t) => {
    t.index(['tenant_id']);
    t.index(['property_id']);
    t.index(['customer_id']);
    t.index(['status']);
    t.index(['assigned_agent_id']);
  });

  // Status change history — gives the franchise dashboard an audit trail
  // ("who moved this lead to Converted, and when").
  await knex.schema.createTable('lead_status_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('lead_id').notNullable().references('id').inTable('leads').onDelete('CASCADE');
    t.uuid('changed_by').references('id').inTable('users').onDelete('SET NULL');
    t.specificType('from_status', 'lead_status');
    t.specificType('to_status', 'lead_status').notNullable();
    t.text('note');
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('lead_status_events', (t) => t.index(['lead_id']));
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('lead_status_events');
  await knex.schema.dropTableIfExists('leads');
}
