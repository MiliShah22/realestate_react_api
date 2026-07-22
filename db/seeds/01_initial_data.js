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
    {
      code: 'starter', name: 'Starter', description: 'For independent agents getting started',
      price_monthly_paise: 99900, price_yearly_paise: 999900, max_listings: 25, max_staff_seats: 1, commission_rate: 5.0,
      features: JSON.stringify(['basic_listings', 'lead_inbox'])
    },
    {
      code: 'growth', name: 'Growth', description: 'For growing franchise teams',
      price_monthly_paise: 299900, price_yearly_paise: 2999900, max_listings: 150, max_staff_seats: 5, commission_rate: 4.0,
      features: JSON.stringify(['basic_listings', 'lead_inbox', 'featured_listings', 'analytics'])
    },
    {
      code: 'enterprise', name: 'Enterprise', description: 'For large multi-city brokerages',
      price_monthly_paise: 799900, price_yearly_paise: 7999900, max_listings: 1000, max_staff_seats: 25, commission_rate: 3.0,
      features: JSON.stringify(['basic_listings', 'lead_inbox', 'featured_listings', 'analytics', 'api_access', 'priority_support'])
    },
  ]).returning('*');

  // ── TENANTS (Franchises) ───────────────────────────
  const [sharmaRealty, srProperties, urbanNest, southernHomes] = await knex('tenants').insert([
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
    {
      name: 'UrbanNest Realty', slug: 'urbannest-realty', billing_email: 'billing@urbannest.in',
      phone: '+91 98450 11223', gstin: '36AAECU5678B1ZD', city: 'Hyderabad',
      plan_id: enterprise.id, status: 'ACTIVE',
      current_period_start: knex.fn.now(), current_period_end: knex.raw("now() + interval '30 days'"),
    },
    {
      name: 'Southern Homes & Estates', slug: 'southern-homes', billing_email: 'billing@southernhomes.in',
      phone: '+91 90040 55667', gstin: '33AAFCS9988B1ZE', city: 'Chennai',
      plan_id: growth.id, status: 'ACTIVE',
      current_period_start: knex.fn.now(), current_period_end: knex.raw("now() + interval '30 days'"),
    },
  ]).returning('*');

  // ── USERS ──────────────────────────────────────────
  const [superAdmin] = await knex('users').insert([
    { role: 'SUPER_ADMIN', name: 'Super Admin', email: 'admin@estatiq.in', password_hash: hash('Admin@123'), city: 'Bengaluru', email_verified: true },
  ]).returning('*');

  const [franchiseOwner] = await knex('users').insert([
    {
      tenant_id: sharmaRealty.id, role: 'FRANCHISE_OWNER', name: 'Priya Sharma', email: 'franchise@estatiq.in',
      password_hash: hash('Franchise@123'), phone: '+91 91234 56789', city: 'Mumbai', email_verified: true
    },
  ]).returning('*');

  const [srOwner] = await knex('users').insert([
    {
      tenant_id: srProperties.id, role: 'FRANCHISE_OWNER', name: 'Karthik Rao', email: 'srowner@estatiq.in',
      password_hash: hash('Franchise@123'), phone: '+91 95003 33333', city: 'Bengaluru', email_verified: true
    },
  ]).returning('*');

  const [urbanOwner] = await knex('users').insert([
    {
      tenant_id: urbanNest.id, role: 'FRANCHISE_OWNER', name: 'Farhan Ali', email: 'urbanowner@estatiq.in',
      password_hash: hash('Franchise@123'), phone: '+91 98450 11223', city: 'Hyderabad', email_verified: true
    },
  ]).returning('*');

  const [southernOwner] = await knex('users').insert([
    {
      tenant_id: southernHomes.id, role: 'FRANCHISE_OWNER', name: 'Lakshmi Narayanan', email: 'southernowner@estatiq.in',
      password_hash: hash('Franchise@123'), phone: '+91 90040 55667', city: 'Chennai', email_verified: true
    },
  ]).returning('*');

  const [customer] = await knex('users').insert([
    {
      role: 'CUSTOMER', name: 'Arjun Reddy', email: 'customer@estatiq.in', password_hash: hash('Customer@123'),
      phone: '+91 98765 43210', city: 'Bengaluru', email_verified: true
    },
  ]).returning('*');

  // ── SUBSCRIPTIONS ──────────────────────────────────
  await knex('subscriptions').insert([
    { tenant_id: sharmaRealty.id, plan_id: growth.id, billing_cycle: 'MONTHLY', starts_at: knex.fn.now() },
    { tenant_id: urbanNest.id, plan_id: enterprise.id, billing_cycle: 'MONTHLY', starts_at: knex.fn.now() },
    { tenant_id: southernHomes.id, plan_id: growth.id, billing_cycle: 'MONTHLY', starts_at: knex.fn.now() },
  ]);

  // ── PROPERTIES ─────────────────────────────────────
  // 18 ACTIVE + a couple PENDING_REVIEW/DRAFT, spread across cities & property types
  const properties = await knex('properties').insert([
    // Bengaluru
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
      tenant_id: srProperties.id, created_by: srOwner.id, assigned_agent_id: srOwner.id,
      title: 'Sobha Dream Acres', description: '81-acre integrated township in East Bengaluru.',
      listing_type: 'SALE', property_type: 'APARTMENT', status: 'ACTIVE',
      bhk: '2 BHK', carpet_area_sqft: 950, price_paise: 7500000000,
      possession_status: 'Under Construction', city: 'Bengaluru', locality: 'Panathur', state: 'Karnataka',
      builder_name: 'Sobha Ltd', rating: 4.4, view_count: 2980, is_verified: true,
      amenities: JSON.stringify(['Swimming Pool', 'Gym', 'Clubhouse', 'Badminton Court']),
      published_at: knex.fn.now(),
    },
    {
      tenant_id: srProperties.id, created_by: srOwner.id, assigned_agent_id: srOwner.id,
      title: 'Whitefield Tech Park Plot', description: 'Clear-titled residential plot near ORR, ideal for custom builds.',
      listing_type: 'SALE', property_type: 'PLOT', status: 'ACTIVE',
      carpet_area_sqft: 2400, price_paise: 18000000000,
      possession_status: 'Ready to Move', city: 'Bengaluru', locality: 'Sarjapur Road', state: 'Karnataka',
      builder_name: null, rating: 4.1, view_count: 860, is_verified: true,
      amenities: JSON.stringify(['Gated Community', 'Corner Plot']),
      published_at: knex.fn.now(),
    },
    {
      tenant_id: srProperties.id, created_by: srOwner.id, assigned_agent_id: srOwner.id,
      title: 'Koramangala Co-living PG', description: 'Fully furnished PG for working professionals, walk to metro.',
      listing_type: 'PG', property_type: 'PG_ROOM', status: 'ACTIVE',
      bhk: 'Shared', carpet_area_sqft: 180, price_paise: 1800000, maintenance_paise: 200000,
      possession_status: 'Ready to Move', city: 'Bengaluru', locality: 'Koramangala', state: 'Karnataka',
      rating: 4.2, view_count: 1540, is_verified: true,
      amenities: JSON.stringify(['WiFi', 'Laundry', 'Housekeeping', 'Food Included']),
      published_at: knex.fn.now(),
    },

    // Mumbai
    {
      tenant_id: sharmaRealty.id, created_by: franchiseOwner.id, assigned_agent_id: franchiseOwner.id,
      title: 'Lodha Park Residences', description: 'Sea-facing 3 BHK residences in the heart of Lower Parel.',
      listing_type: 'SALE', property_type: 'APARTMENT', status: 'ACTIVE',
      bhk: '3 BHK', carpet_area_sqft: 1620, price_paise: 45000000000, price_per_sqft_paise: 2777800,
      possession_status: 'Ready to Move', city: 'Mumbai', locality: 'Lower Parel', state: 'Maharashtra',
      builder_name: 'Lodha Group', rating: 4.7, is_featured: true, is_verified: true, view_count: 6210,
      amenities: JSON.stringify(['Swimming Pool', 'Gym', 'Clubhouse', 'Sea View', 'Concierge']),
      published_at: knex.fn.now(),
    },
    {
      tenant_id: sharmaRealty.id, created_by: franchiseOwner.id, assigned_agent_id: franchiseOwner.id,
      title: 'Andheri West Office Suite', description: 'Grade-A commercial office space with skyline views.',
      listing_type: 'RENT', property_type: 'OFFICE', status: 'ACTIVE',
      carpet_area_sqft: 3200, price_paise: 480000000, maintenance_paise: 60000000,
      possession_status: 'Ready to Move', city: 'Mumbai', locality: 'Andheri West', state: 'Maharashtra',
      rating: 4.3, view_count: 1120, is_verified: true,
      amenities: JSON.stringify(['Central AC', 'Conference Rooms', 'Cafeteria', 'Parking']),
      published_at: knex.fn.now(),
    },
    {
      tenant_id: sharmaRealty.id, created_by: franchiseOwner.id, assigned_agent_id: franchiseOwner.id,
      title: 'Powai Lakeside 1BHK', description: 'Compact 1 BHK ideal for young professionals, near IIT Bombay.',
      listing_type: 'RENT', property_type: 'APARTMENT', status: 'ACTIVE',
      bhk: '1 BHK', carpet_area_sqft: 620, price_paise: 3800000, maintenance_paise: 350000,
      possession_status: 'Ready to Move', city: 'Mumbai', locality: 'Powai', state: 'Maharashtra',
      rating: 4.0, view_count: 940, is_verified: true,
      amenities: JSON.stringify(['Gym', 'Lift', 'Security']),
      published_at: knex.fn.now(),
    },

    // Gurugram / Delhi NCR
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
      tenant_id: sharmaRealty.id, created_by: franchiseOwner.id, assigned_agent_id: franchiseOwner.id,
      title: 'M3M Urbana Retail Shop', description: 'High-footfall commercial retail unit on the ground floor.',
      listing_type: 'SALE', property_type: 'COMMERCIAL', status: 'ACTIVE',
      carpet_area_sqft: 850, price_paise: 9500000000,
      possession_status: 'Ready to Move', city: 'Gurugram', locality: 'Sector 67', state: 'Haryana',
      builder_name: 'M3M India', rating: 4.2, view_count: 1330, is_verified: true,
      amenities: JSON.stringify(['High Footfall', 'Ample Parking', 'Food Court Nearby']),
      published_at: knex.fn.now(),
    },
    {
      tenant_id: sharmaRealty.id, created_by: franchiseOwner.id, assigned_agent_id: franchiseOwner.id,
      title: 'Dwarka Sector 21 Plot', description: 'DDA-approved residential plot near the airport metro line.',
      listing_type: 'SALE', property_type: 'PLOT', status: 'ACTIVE',
      carpet_area_sqft: 1800, price_paise: 21000000000,
      possession_status: 'Ready to Move', city: 'Delhi NCR', locality: 'Dwarka Sector 21', state: 'Delhi',
      rating: 4.0, view_count: 780, is_verified: true,
      amenities: JSON.stringify(['DDA Approved', 'Metro Nearby']),
      published_at: knex.fn.now(),
    },

    // Hyderabad
    {
      tenant_id: urbanNest.id, created_by: urbanOwner.id, assigned_agent_id: urbanOwner.id,
      title: 'My Home Bhooja', description: 'Spacious 3 BHK apartments close to HITEC City with skyline views.',
      listing_type: 'SALE', property_type: 'APARTMENT', status: 'ACTIVE',
      bhk: '3 BHK', carpet_area_sqft: 1780, price_paise: 15200000000,
      possession_status: 'Under Construction', city: 'Hyderabad', locality: 'Gachibowli', state: 'Telangana',
      builder_name: 'My Home Group', rating: 4.6, is_featured: true, is_verified: true, view_count: 3410,
      amenities: JSON.stringify(['Swimming Pool', 'Gym', 'Kids Play Area', 'Jogging Track']),
      published_at: knex.fn.now(),
    },
    {
      tenant_id: urbanNest.id, created_by: urbanOwner.id, assigned_agent_id: urbanOwner.id,
      title: 'HITEC City Grade-A Office', description: 'Fully fitted-out office floor for IT/ITES occupiers.',
      listing_type: 'RENT', property_type: 'OFFICE', status: 'ACTIVE',
      carpet_area_sqft: 5200, price_paise: 780000000, maintenance_paise: 90000000,
      possession_status: 'Ready to Move', city: 'Hyderabad', locality: 'HITEC City', state: 'Telangana',
      rating: 4.5, is_featured: true, view_count: 1980, is_verified: true,
      amenities: JSON.stringify(['Central AC', 'Backup Power', 'Cafeteria', 'Parking']),
      published_at: knex.fn.now(),
    },
    {
      tenant_id: urbanNest.id, created_by: urbanOwner.id, assigned_agent_id: urbanOwner.id,
      title: 'Kondapur Independent Villa', description: '4 BHK independent villa with private garden and terrace.',
      listing_type: 'SALE', property_type: 'VILLA', status: 'ACTIVE',
      bhk: '4 BHK', carpet_area_sqft: 2900, price_paise: 19500000000,
      possession_status: 'Ready to Move', city: 'Hyderabad', locality: 'Kondapur', state: 'Telangana',
      rating: 4.4, view_count: 1265, is_verified: true,
      amenities: JSON.stringify(['Private Garden', 'Terrace', 'Parking', 'Security']),
      published_at: knex.fn.now(),
    },

    // Pune
    {
      tenant_id: urbanNest.id, created_by: urbanOwner.id, assigned_agent_id: urbanOwner.id,
      title: 'Kolte Patil Life Republic', description: 'Integrated township with 2/3 BHK homes near Hinjewadi IT park.',
      listing_type: 'SALE', property_type: 'APARTMENT', status: 'ACTIVE',
      bhk: '2 BHK', carpet_area_sqft: 1080, price_paise: 6800000000,
      possession_status: 'Ready to Move', city: 'Pune', locality: 'Hinjewadi', state: 'Maharashtra',
      builder_name: 'Kolte Patil', rating: 4.3, view_count: 2040, is_verified: true,
      amenities: JSON.stringify(['Swimming Pool', 'Gym', 'Clubhouse', 'Amphitheatre']),
      published_at: knex.fn.now(),
    },
    {
      tenant_id: urbanNest.id, created_by: urbanOwner.id, assigned_agent_id: urbanOwner.id,
      title: 'Baner Co-living Studio', description: 'Modern studio PG with all amenities for IT professionals.',
      listing_type: 'PG', property_type: 'PG_ROOM', status: 'ACTIVE',
      bhk: 'Private', carpet_area_sqft: 220, price_paise: 2200000, maintenance_paise: 150000,
      possession_status: 'Ready to Move', city: 'Pune', locality: 'Baner', state: 'Maharashtra',
      rating: 4.1, view_count: 890, is_verified: true,
      amenities: JSON.stringify(['WiFi', 'Housekeeping', 'Food Included', 'Gym']),
      published_at: knex.fn.now(),
    },

    // Chennai
    {
      tenant_id: southernHomes.id, created_by: southernOwner.id, assigned_agent_id: southernOwner.id,
      title: 'Casagrand Utopia', description: 'Premium gated community apartments in OMR IT corridor.',
      listing_type: 'SALE', property_type: 'APARTMENT', status: 'ACTIVE',
      bhk: '3 BHK', carpet_area_sqft: 1520, price_paise: 9800000000,
      possession_status: 'Under Construction', city: 'Chennai', locality: 'OMR', state: 'Tamil Nadu',
      builder_name: 'Casagrand', rating: 4.4, is_featured: true, view_count: 2210, is_verified: true,
      amenities: JSON.stringify(['Swimming Pool', 'Gym', 'Clubhouse', 'Indoor Games']),
      published_at: knex.fn.now(),
    },
    {
      tenant_id: southernHomes.id, created_by: southernOwner.id, assigned_agent_id: southernOwner.id,
      title: 'ECR Beachside Plot', description: 'DTCP-approved plot minutes from the East Coast Road beaches.',
      listing_type: 'SALE', property_type: 'PLOT', status: 'ACTIVE',
      carpet_area_sqft: 2600, price_paise: 14500000000,
      possession_status: 'Ready to Move', city: 'Chennai', locality: 'ECR', state: 'Tamil Nadu',
      rating: 4.2, view_count: 705, is_verified: true,
      amenities: JSON.stringify(['DTCP Approved', 'Beach Proximity']),
      published_at: knex.fn.now(),
    },
    {
      tenant_id: southernHomes.id, created_by: southernOwner.id, assigned_agent_id: southernOwner.id,
      title: 'T Nagar Commercial Showroom', description: 'High-visibility showroom space in Chennai\'s busiest retail hub.',
      listing_type: 'RENT', property_type: 'COMMERCIAL', status: 'ACTIVE',
      carpet_area_sqft: 1400, price_paise: 32000000, maintenance_paise: 4000000,
      possession_status: 'Ready to Move', city: 'Chennai', locality: 'T Nagar', state: 'Tamil Nadu',
      rating: 4.1, view_count: 640, is_verified: true,
      amenities: JSON.stringify(['High Footfall', 'Main Road Facing']),
      published_at: knex.fn.now(),
    },

    // Ahmedabad
    {
      tenant_id: urbanNest.id, created_by: urbanOwner.id, assigned_agent_id: urbanOwner.id,
      title: 'Godrej Garden City Villa', description: 'Spacious 4 BHK villa in a premium gated township.',
      listing_type: 'SALE', property_type: 'VILLA', status: 'ACTIVE',
      bhk: '4 BHK', carpet_area_sqft: 3400, price_paise: 16800000000,
      possession_status: 'Ready to Move', city: 'Ahmedabad', locality: 'SG Highway', state: 'Gujarat',
      builder_name: 'Godrej Properties', rating: 4.5, view_count: 1580, is_verified: true,
      amenities: JSON.stringify(['Swimming Pool', 'Gym', 'Clubhouse', 'Garden']),
      published_at: knex.fn.now(),
    },

    // Pending / draft — not counted in public homepage aggregates
    {
      tenant_id: srProperties.id, created_by: srOwner.id,
      title: 'JP Nagar Under-Review Flat', description: '2 BHK flat awaiting admin approval.',
      listing_type: 'SALE', property_type: 'APARTMENT', status: 'PENDING_REVIEW',
      bhk: '2 BHK', carpet_area_sqft: 1020, price_paise: 6200000000,
      possession_status: 'Ready to Move', city: 'Bengaluru', locality: 'JP Nagar', state: 'Karnataka',
      rating: 0, view_count: 12,
      amenities: JSON.stringify(['Lift', 'Parking']),
    },
    {
      tenant_id: sharmaRealty.id, created_by: franchiseOwner.id,
      title: 'Thane Draft Listing', description: 'Draft listing not yet submitted for review.',
      listing_type: 'RENT', property_type: 'APARTMENT', status: 'DRAFT',
      bhk: '2 BHK', carpet_area_sqft: 880, price_paise: 2800000,
      possession_status: 'Ready to Move', city: 'Thane', locality: 'Ghodbunder Road', state: 'Maharashtra',
      rating: 0, view_count: 0,
      amenities: JSON.stringify([]),
    },
  ]).returning('*');

  // ── LEADS ──────────────────────────────────────────
  const activeProperties = properties.filter(p => p.status === 'ACTIVE');
  await knex('leads').insert([
    {
      tenant_id: sharmaRealty.id, property_id: properties[0].id, customer_id: customer.id,
      assigned_agent_id: franchiseOwner.id,
      contact_name: customer.name, contact_email: customer.email, contact_phone: customer.phone,
      budget_label: '₹1.2Cr', budget_paise: 12000000000, city: 'Bengaluru', source: 'SEARCH',
      message: 'Interested in a site visit this weekend.', status: 'NEW',
    },
    {
      tenant_id: urbanNest.id, property_id: activeProperties.find(p => p.title === 'My Home Bhooja')?.id,
      customer_id: customer.id, assigned_agent_id: urbanOwner.id,
      contact_name: customer.name, contact_email: customer.email, contact_phone: customer.phone,
      budget_label: '₹1.5Cr', budget_paise: 15000000000, city: 'Hyderabad', source: 'DIRECT',
      message: 'Please share the floor plan and payment schedule.', status: 'CONTACTED',
    },
    {
      tenant_id: southernHomes.id, property_id: activeProperties.find(p => p.title === 'Casagrand Utopia')?.id,
      customer_id: null, assigned_agent_id: southernOwner.id,
      contact_name: 'Guest Enquirer', contact_email: 'guest@example.com', contact_phone: '+91 90000 12345',
      budget_label: '₹1Cr', budget_paise: 10000000000, city: 'Chennai', source: 'AD',
      message: 'Looking for immediate possession options.', status: 'FOLLOW_UP',
    },
  ]);

  console.log('✅ Seed complete:');
  console.log(`   Super Admin     → admin@estatiq.in / Admin@123`);
  console.log(`   Franchise Owner → franchise@estatiq.in / Franchise@123  (tenant: ${sharmaRealty.slug})`);
  console.log(`   SR Owner        → srowner@estatiq.in / Franchise@123  (tenant: ${srProperties.slug})`);
  console.log(`   UrbanNest Owner → urbanowner@estatiq.in / Franchise@123  (tenant: ${urbanNest.slug})`);
  console.log(`   Southern Owner  → southernowner@estatiq.in / Franchise@123  (tenant: ${southernHomes.slug})`);
  console.log(`   Customer        → customer@estatiq.in / Customer@123`);
  console.log(`   Properties seeded: ${properties.length} (${activeProperties.length} ACTIVE)`);
}