import { GraphQLError } from 'graphql';
import db from '../../db/connection.js';
import { withTenant } from '../../db/withTenant.js';
import { requireAuth, requireRole, PLATFORM_ROLES, FRANCHISE_ROLES } from '../context.js';

/**
 * Three concerns live here because they're all small, cross-cutting, and
 * don't warrant their own file each: saved searches/alerts (customer-side),
 * search history (analytics input), and dashboard/report aggregates
 * (admin + franchise reporting — the data backing the React admin panel's
 * Dashboard and Reports pages, and the franchise dashboard's KPI cards).
 */

// ── Saved Searches & History ────────────────────────────────────────────
export const savedSearchResolvers = {
  Query: {
    mySavedSearches: async (_p, _a, ctx) => {
      const user = requireAuth(ctx);
      return db('saved_searches').where('user_id', user.id).orderBy('created_at', 'desc');
    },

    mySearchHistory: async (_p, { limit }, ctx) => {
      const user = requireAuth(ctx);
      const rows = await db('search_history')
        .where('user_id', user.id)
        .orderBy('created_at', 'desc')
        .limit(limit || 10);
      return rows.map(r => r.query);
    },
  },

  Mutation: {
    saveSearch: async (_p, { label, query, alertsEnabled }, ctx) => {
      const user = requireAuth(ctx);
      const [saved] = await db('saved_searches').insert({
        user_id: user.id,
        label,
        query: JSON.stringify(query),
        alerts_enabled: alertsEnabled,
      }).returning('*');
      return saved;
    },

    toggleSearchAlert: async (_p, { id, enabled }, ctx) => {
      const user = requireAuth(ctx);
      const [updated] = await db('saved_searches')
        .where({ id, user_id: user.id })
        .update({ alerts_enabled: enabled })
        .returning('*');
      if (!updated) throw new GraphQLError('Saved search not found.', { extensions: { code: 'NOT_FOUND' } });
      return updated;
    },

    deleteSavedSearch: async (_p, { id }, ctx) => {
      const user = requireAuth(ctx);
      await db('saved_searches').where({ id, user_id: user.id }).del();
      return { success: true, message: 'Saved search removed.' };
    },

    recordSearch: async (_p, { query, resultCount }, ctx) => {
      await db('search_history').insert({
        user_id: ctx.user?.id || null,
        query: JSON.stringify(query),
        result_count: resultCount,
      });
      return { success: true };
    },

    clearSearchHistory: async (_p, _a, ctx) => {
      const user = requireAuth(ctx);
      await db('search_history').where('user_id', user.id).del();
      return { success: true, message: 'Search history cleared.' };
    },
  },

  SavedSearch: {
    alertsEnabled: (s) => s.alerts_enabled,
    lastNotifiedAt: (s) => s.last_notified_at,
    createdAt: (s) => s.created_at,
    query: (s) => (typeof s.query === 'string' ? JSON.parse(s.query) : s.query),
  },
};

// ── Dashboard / Reports ─────────────────────────────────────────────────
export const reportResolvers = {
  Query: {
    /**
     * PUBLIC — powers the homepage hero stat strip. No auth, no RLS:
     * counts span all tenants' ACTIVE listings and all user roles.
     */
    platformStats: async () => {
      const [propRow, cityRow, buyerRow, agentRow] = await Promise.all([
        db('properties').where({ status: 'ACTIVE' }).whereNull('deleted_at').count('* as c').first(),
        db('properties')
          .where({ status: 'ACTIVE' })
          .whereNull('deleted_at')
          .whereNotNull('city')
          .countDistinct('city as c')
          .first(),
        db('users').where({ role: 'CUSTOMER' }).whereNull('deleted_at').count('* as c').first(),
        db('users')
          .whereIn('role', ['FRANCHISE_OWNER', 'FRANCHISE_STAFF'])
          .whereNull('deleted_at')
          .count('* as c')
          .first(),
      ]);

      return {
        totalProperties: Number(propRow.c),
        totalCities: Number(cityRow.c),
        totalBuyers: Number(buyerRow.c),
        totalAgents: Number(agentRow.c),
      };
    },
    /**
     * Powers both the admin panel Dashboard (platform-wide, when called by
     * SUPER_ADMIN/SUPPORT_AGENT) and the franchise Dashboard overview cards
     * (tenant-scoped, when called by FRANCHISE_OWNER/STAFF) — same query
     * shape either way; RLS does the scoping for tenant-bound tables.
     */
    customerDashboardStats: async (_p, _a, ctx) => {
      const user = requireRole(ctx, ['CUSTOMER']);

      const [
        savedRow,
        leadsRow,
        convertedRow,
      ] = await Promise.all([
        db('saved_properties')
          .where('user_id', user.id)
          .count('* as c')
          .first(),

        db('leads')
          .where('customer_id', user.id)
          .count('* as c')
          .first(),

        db('leads')
          .where('customer_id', user.id)
          .where('status', 'CONVERTED')
          .count('* as c')
          .first(),
      ]);

      return {
        savedProperties: Number(savedRow.c),
        enquiriesSent: Number(leadsRow.c),
        convertedLeads: Number(convertedRow.c),
        activeAlerts: 0,
      };
    },
    dashboardStats: async (_p, _a, ctx) => {
      const user = requireRole(ctx, [...PLATFORM_ROLES, ...FRANCHISE_ROLES]);
      const isPlatform = PLATFORM_ROLES.includes(user.role);

      const [propertiesRow, usersRow, pendingReviewsRow, newLeadsRow, franchiseRow, revenueRow] = await Promise.all([
        withTenant(ctx.rls, (trx) => trx('properties').whereNull('deleted_at').count('* as c').first()),
        isPlatform
          ? db('users').whereNull('deleted_at').where('is_active', true).count('* as c').first()
          : withTenant(ctx.rls, (trx) => trx('users').whereNull('deleted_at').where('is_active', true).count('* as c').first()),
        withTenant(ctx.rls, (trx) => trx('reviews').where('status', 'PENDING').count('* as c').first()),
        withTenant(ctx.rls, (trx) =>
          trx('leads').where('created_at', '>=', trx.raw("now() - interval '30 days'")).count('* as c').first()
        ),
        isPlatform ? db('tenants').whereNull('deleted_at').where('status', 'ACTIVE').count('* as c').first() : Promise.resolve({ c: 0 }),
        isPlatform
          ? db('commission_ledger').where('created_at', '>=', db.raw("date_trunc('month', now())")).sum('commission_paise as sum').first()
          : withTenant(ctx.rls, (trx) =>
            trx('commission_ledger').where('created_at', '>=', trx.raw("date_trunc('month', now())")).sum('commission_paise as sum').first()
          ),
      ]);

      return {
        totalProperties: Number(propertiesRow.c),
        activeUsers: Number(usersRow.c),
        monthlyRevenuePaise: Number(revenueRow.sum) || 0,
        pendingReviews: Number(pendingReviewsRow.c),
        franchiseCount: Number(franchiseRow.c),
        newLeads: Number(newLeadsRow.c),
      };
    },

    monthlyMetrics: async (_p, { months }, ctx) => {
      const user = requireRole(ctx, [...PLATFORM_ROLES, ...FRANCHISE_ROLES]);
      const isPlatform = PLATFORM_ROLES.includes(user.role);
      const n = Math.min(24, Math.max(1, months || 12));

      const revenueQuery = isPlatform
        ? db('commission_ledger')
        : null; // tenant case below goes through withTenant

      const runRevenue = async () => {
        const base = `
          SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS month,
                 date_trunc('month', created_at) AS month_start,
                 SUM(commission_paise) AS revenue_paise
          FROM commission_ledger
          WHERE created_at >= now() - interval '${n} months'
          GROUP BY 1, 2 ORDER BY 2 ASC
        `;
        if (isPlatform) return db.raw(base).then(r => r.rows);
        return withTenant(ctx.rls, (trx) => trx.raw(base).then(r => r.rows));
      };

      const runLeads = async () => {
        const base = `
          SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS month,
                 date_trunc('month', created_at) AS month_start,
                 COUNT(*) AS leads
          FROM leads
          WHERE created_at >= now() - interval '${n} months'
          GROUP BY 1, 2 ORDER BY 2 ASC
        `;
        return withTenant(ctx.rls, (trx) => trx.raw(base).then(r => r.rows));
      };

      const runProperties = async () => {
        const base = `
          SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS month,
                 date_trunc('month', created_at) AS month_start,
                 COUNT(*) AS properties
          FROM properties
          WHERE created_at >= now() - interval '${n} months' AND deleted_at IS NULL
          GROUP BY 1, 2 ORDER BY 2 ASC
        `;
        return withTenant(ctx.rls, (trx) => trx.raw(base).then(r => r.rows));
      };

      const [revenueRows, leadRows, propRows] = await Promise.all([runRevenue(), runLeads(), runProperties()]);

      const merged = new Map();
      for (const r of revenueRows) merged.set(r.month, { month: r.month, revenuePaise: Number(r.revenue_paise) || 0, leads: 0, propertiesListed: 0 });
      for (const r of leadRows) {
        const existing = merged.get(r.month) || { month: r.month, revenuePaise: 0, leads: 0, propertiesListed: 0 };
        existing.leads = Number(r.leads);
        merged.set(r.month, existing);
      }
      for (const r of propRows) {
        const existing = merged.get(r.month) || { month: r.month, revenuePaise: 0, leads: 0, propertiesListed: 0 };
        existing.propertiesListed = Number(r.properties);
        merged.set(r.month, existing);
      }

      return Array.from(merged.values());
    },

    cityMetrics: async (_p, _a, ctx) => {
      requireRole(ctx, [...PLATFORM_ROLES, ...FRANCHISE_ROLES]);

      const rows = await withTenant(ctx.rls, (trx) =>
        trx('properties')
          .select('city')
          .count('* as listings')
          .whereNull('deleted_at')
          .groupBy('city')
          .orderBy('listings', 'desc')
          .limit(10)
      );

      const results = await Promise.all(rows.map(async (r) => {
        const [leadRow, revenueRow] = await Promise.all([
          withTenant(ctx.rls, (trx) => trx('leads').where('city', r.city).count('* as c').first()),
          withTenant(ctx.rls, (trx) =>
            trx('commission_ledger')
              .join('properties', 'properties.id', 'commission_ledger.property_id')
              .where('properties.city', r.city)
              .sum('commission_ledger.commission_paise as sum')
              .first()
          ),
        ]);
        return {
          city: r.city,
          listings: Number(r.listings),
          leads: Number(leadRow.c),
          revenuePaise: Number(revenueRow.sum) || 0,
        };
      }));

      return results;
    },

    propertyTypeBreakdown: async (_p, _a, ctx) => {
      requireRole(ctx, [...PLATFORM_ROLES, ...FRANCHISE_ROLES]);

      const rows = await withTenant(ctx.rls, (trx) =>
        trx('properties').select('property_type').count('* as count').whereNull('deleted_at').groupBy('property_type')
      );
      const total = rows.reduce((sum, r) => sum + Number(r.count), 0) || 1;

      return rows.map(r => ({
        propertyType: r.property_type,
        count: Number(r.count),
        percentage: Math.round((Number(r.count) / total) * 1000) / 10,
      }));
    },

    revenueBreakdown: async (_p, _a, ctx) => {
      requireRole(ctx, PLATFORM_ROLES);

      const [subRow, commRow] = await Promise.all([
        db('invoices').where('status', 'PAID').where('paid_at', '>=', db.raw("date_trunc('month', now())")).sum('total_paise as sum').first(),
        db('commission_ledger').where('created_at', '>=', db.raw("date_trunc('month', now())")).sum('commission_paise as sum').first(),
      ]);

      const subscriptionRevenuePaise = Number(subRow.sum) || 0;
      const commissionRevenuePaise = Number(commRow.sum) || 0;

      return {
        subscriptionRevenuePaise,
        commissionRevenuePaise,
        totalRevenuePaise: subscriptionRevenuePaise + commissionRevenuePaise,
      };
    },
  },
};
