import bcrypt from 'bcryptjs';

/** @param {import('knex').Knex} knex */
export async function seed(knex) {
  // Clean in FK-safe order
  await knex('commission_ledger').del();
  await knex('invoices').del();
  await knex('subscriptions').del();
  await knex('search_history').del();
  await knex('saved_searches').del();
  await knex('reviews').del();
  await knex('lead_status_events').del();
  await knex('leads').del();
  await knex('saved_properties').del();
  await knex('property_images').del();
  await knex('properties').del();
  await knex('verification_tokens').del();
  await knex('refresh_tokens').del();
  await knex('users').del();
  await knex('tenants').del();
  await knex('plans').del();

  const hash = (pwd) => bcrypt.hashSync(pwd, 10);

  // ── PLANS ──────────────────────────────────────────
  const [starter, growth, enterprise] = await knex('plans').insert([
    { code: 'starter',    name: 'Starter',    description: 'For independent agents getting started',
      price_monthly_paise: 99900,  price_yearly_paise: 999900,  max_listings: 25,  max_staff_seats: 1, commission_rate: 5.0,
      features: JSON.stringify(['basic_listings', 'lead_inbox']) },
    { code: 'growth',     name: 'Growth',     description: 'For growing franchise teams',
      price_monthly_paise: 299900, price_yearly_paise: 2999900, max_listings: 150, max_staff_seats: 5, commission_rate: 4.0,
      features: JSON.stringify(['basic_listings', 'lead_inbox', 'featured_listings', 'analytics']) },
    { code: 'enterprise', name: 'Enterprise', description: 'For large multi-city brokerages',
      price_monthly_paise: 799900, price_yearly_paise: 7999900, max_listings: 1000, max_staff_seats: 25, commission_rate: 3.0,
      features: JSON.stringify(['basic_listings', 'lead_inbox', 'featured_listings', 'analytics', 'api_access', 'priority_support']) },
  ]).returning('*');

  // ── TENANTS (Franchises) ───────────────────────────
  const [sharmaRealty, srProperties] = await knex('tenants').insert([
    {
      name: 'Sharma Realty Pvt Ltd', slug: 'sharma-realty', billing_email: 'billing@sharmarealty.com',
      phone: '+91 91234 56789', gstin: '27AABCS1429B1ZB', city: 'Mumbai',
      plan_id: growth.id, status: 'ACTIVE',
      current_period_start: knex.fn.now(), current_period_end: knex.raw("now() + interval '30 days'"),
    },
    {
      name: 'SR Properties', slug: 'sr-properties', billing_email: 'billing@srproperties.com',
      phone: '+91 95003 33333', gstin: '29AADCS2341B1ZC', city: 'Bengaluru',
      plan_id: starter.id, status: 'TRIAL',
      trial_ends_at: knex.raw("now() + interval '14 days'"),
    },
  ]).returning('*');

  // ── USERS ──────────────────────────────────────────
  const [superAdmin] = await knex('users').insert([
    { role: 'SUPER_ADMIN', name: 'Super Admin', email: 'admin@estatiq.in', password_hash: hash('Admin@123'), city: 'Bengaluru', email_verified: true },
  ]).returning('*');

  const [franchiseOwner] = await knex('users').insert([
    { tenant_id: sharmaRealty.id, role: 'FRANCHISE_OWNER', name: 'Priya Sharma', email: 'franchise@estatiq.in',
      password_hash: hash('Franchise@123'), phone: '+91 91234 56789', city: 'Mumbai', email_verified: true },
  ]).returning('*');

  const [customer] = await knex('users').insert([
    { role: 'CUSTOMER', name: 'Arjun Reddy', email: 'customer@estatiq.in', password_hash: hash('Customer@123'),
      phone: '+91 98765 43210', city: 'Bengaluru', email_verified: true },
  ]).returning('*');

  // ── SUBSCRIPTIONS ──────────────────────────────────
  await knex('subscriptions').insert([
    { tenant_id: sharmaRealty.id, plan_id: growth.id, billing_cycle: 'MONTHLY', starts_at: knex.fn.now() },
  ]);

  // ── PROPERTIES ─────────────────────────────────────
  const properties = await knex('properties').insert([
    {
      tenant_id: sharmaRealty.id, created_by: franchiseOwner.id, assigned_agent_id: franchiseOwner.id,
      title: 'Prestige Lake Ridge', description: 'Premium residential project with world-class amenities near tech parks.',
      listing_type: 'SALE', property_type: 'APARTMENT', status: 'ACTIVE',
      bhk: '3 BHK', carpet_area_sqft: 1450, price_paise: 12500000000, price_per_sqft_paise: 862100,
      possession_status: 'Under Construction', city: 'Bengaluru', locality: 'Whitefield', state: 'Karnataka',
      builder_name: 'Prestige Group', rating: 4.5, is_featured: true, is_verified: true, view_count: 2412,
      amenities: JSON.stringify(['Swimming Pool', 'Gym', 'Clubhouse', '24x7 Security', 'Power Backup', 'Parking']),
      published_at: knex.fn.now(),
    },
    {
      tenant_id: sharmaRealty.id, created_by: franchiseOwner.id, assigned_agent_id: franchiseOwner.id,
      title: 'DLF The Arbour', description: 'Ultra-luxury 4 BHK residences on Golf Course Extension Road.',
      listing_type: 'SALE', property_type: 'VILLA', status: 'ACTIVE',
      bhk: '4 BHK', carpet_area_sqft: 3100, price_paise: 28000000000,
      possession_status: 'Ready to Move', city: 'Gurugram', locality: 'Sector 63', state: 'Haryana',
      builder_name: 'DLF Limited', rating: 4.8, is_featured: true, is_verified: true, view_count: 5142,
      amenities: JSON.stringify(['Swimming Pool', 'Gym', 'Clubhouse', 'Spa', 'Tennis Court', 'Concierge']),
      published_at: knex.fn.now(),
    },
    {
      tenant_id: srProperties.id, created_by: null,
      title: 'Sobha Dream Acres', description: '81-acre integrated township in East Bengaluru.',
      listing_type: 'SALE', property_type: 'APARTMENT', status: 'PENDING_REVIEW',
      bhk: '2 BHK', carpet_area_sqft: 950, price_paise: 7500000000,
      possession_status: 'Under Construction', city: 'Bengaluru', locality: 'Panathur', state: 'Karnataka',
      builder_name: 'Sobha Ltd', rating: 4.4, view_count: 2980,
      amenities: JSON.stringify(['Swimming Pool', 'Gym', 'Clubhouse', 'Badminton Court']),
    },
  ]).returning('*');

  // ── LEADS ──────────────────────────────────────────
  await knex('leads').insert([
    {
      tenant_id: sharmaRealty.id, property_id: properties[0].id, customer_id: customer.id,
      assigned_agent_id: franchiseOwner.id,
      contact_name: customer.name, contact_email: customer.email, contact_phone: customer.phone,
      budget_label: '₹1.2Cr', budget_paise: 12000000000, city: 'Bengaluru', source: 'SEARCH',
      message: 'Interested in a site visit this weekend.', status: 'NEW',
    },
  ]);

  console.log('✅ Seed complete:');
  console.log(`   Super Admin     → admin@estatiq.in / Admin@123`);
  console.log(`   Franchise Owner → franchise@estatiq.in / Franchise@123  (tenant: ${sharmaRealty.slug})`);
  console.log(`   Customer        → customer@estatiq.in / Customer@123`);
}
