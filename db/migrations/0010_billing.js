/**
 * 0010 — Billing: Subscriptions, Invoices, Commission Ledger
 *
 * This is what makes the system a SaaS rather than a flat multi-tenant app:
 * tenants pay a subscription fee (plan) PLUS a per-deal commission. Both
 * revenue streams are tracked here so /reports can show MRR and
 * commission revenue separately.
 */
export async function up(knex) {
  await knex.schema.createTable('subscriptions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.uuid('plan_id').notNullable().references('id').inTable('plans').onDelete('RESTRICT');
    t.string('billing_cycle', 10).notNullable().defaultTo('MONTHLY'); // MONTHLY | YEARLY
    t.timestamp('starts_at').notNullable();
    t.timestamp('ends_at');
    t.boolean('auto_renew').notNullable().defaultTo(true);
    t.string('external_subscription_id', 100); // Razorpay/Stripe subscription id
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('subscriptions', (t) => t.index(['tenant_id']));

  await knex.schema.createTable('invoices', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.uuid('subscription_id').references('id').inTable('subscriptions').onDelete('SET NULL');
    t.string('invoice_number', 40).notNullable().unique();
    t.specificType('status', 'invoice_status').notNullable().defaultTo('OPEN');
    t.integer('subtotal_paise').notNullable();
    t.integer('tax_paise').notNullable().defaultTo(0);
    t.integer('total_paise').notNullable();
    t.timestamp('due_date');
    t.timestamp('paid_at');
    t.string('external_payment_id', 100);
    t.jsonb('line_items').notNullable().defaultTo('[]'); // [{description, amount_paise}]
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('invoices', (t) => {
    t.index(['tenant_id']);
    t.index(['status']);
  });

  // Commission ledger — one row per closed deal (lead converted to a sale),
  // recording the platform's cut. Sums of this table = commission revenue.
  await knex.schema.createTable('commission_ledger', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.uuid('lead_id').references('id').inTable('leads').onDelete('SET NULL');
    t.uuid('property_id').references('id').inTable('properties').onDelete('SET NULL');
    t.integer('deal_value_paise').notNullable();
    t.decimal('commission_rate', 5, 2).notNullable();
    t.integer('commission_paise').notNullable();
    t.boolean('is_settled').notNullable().defaultTo(false);
    t.timestamp('settled_at');
    t.timestamps(true, true);
  });
  await knex.schema.alterTable('commission_ledger', (t) => {
    t.index(['tenant_id']);
    t.index(['is_settled']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('commission_ledger');
  await knex.schema.dropTableIfExists('invoices');
  await knex.schema.dropTableIfExists('subscriptions');
}
