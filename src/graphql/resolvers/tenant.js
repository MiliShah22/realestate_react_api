import { GraphQLError } from 'graphql';
import db from '../../db/connection.js';
import { withTenant } from '../../db/withTenant.js';
import { requireAuth, requireRole, PLATFORM_ROLES } from '../context.js';
import { hashPassword } from '../../utils/password.js';
import { paginationArgs, buildPageInfo } from '../../utils/format.js';
import { nanoid } from 'nanoid';

export const tenantResolvers = {
  Query: {
    plans: async () => db('plans').where('is_active', true).orderBy('price_monthly_paise', 'asc'),
    plan: async (_p, { id }) => db('plans').where('id', id).first(),

    tenants: async (_p, { pagination, search, status }, ctx) => {
      requireRole(ctx, PLATFORM_ROLES);
      const { page, pageSize, offset, limit } = paginationArgs(pagination);

      let q = db('tenants').whereNull('deleted_at');
      if (status) q = q.andWhere('status', status);
      if (search) q = q.andWhere((b) => b.whereILike('name', `%${search}%`).orWhereILike('billing_email', `%${search}%`));

      const countRow = await q.clone().count('* as count').first();
      const items = await q.clone().orderBy('created_at', 'desc').offset(offset).limit(limit);

      return { items, pageInfo: buildPageInfo({ page, pageSize, totalCount: Number(countRow.count) }) };
    },

    tenant: async (_p, { id }, ctx) => {
      const user = requireAuth(ctx);
      if (!PLATFORM_ROLES.includes(user.role) && user.tenantId !== id) {
        throw new GraphQLError('Not authorized to view this tenant.', { extensions: { code: 'FORBIDDEN' } });
      }
      return db('tenants').where('id', id).first();
    },

    myTenant: async (_p, _a, ctx) => {
      const user = requireAuth(ctx);
      if (!user.tenantId) return null;
      return db('tenants').where('id', user.tenantId).first();
    },
  },

  Mutation: {
    createTenant: async (_p, { input }, ctx) => {
      requireRole(ctx, ['SUPER_ADMIN']);
      const { name, billingEmail, phone, gstin, city, planId, ownerName, ownerEmail, ownerPassword, ownerPhone } = input;

      const existingUser = await db('users').whereRaw('lower(email) = lower(?)', [ownerEmail]).first();
      if (existingUser) throw new GraphQLError('That owner email is already in use.', { extensions: { code: 'CONFLICT' } });

      const result = await db.transaction(async (trx) => {
        const [tenant] = await trx('tenants').insert({
          name,
          slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${nanoid(6)}`,
          billing_email: billingEmail,
          phone, gstin, city,
          plan_id: planId,
          status: 'ACTIVE',
          current_period_start: trx.fn.now(),
          current_period_end: trx.raw("now() + interval '30 days'"),
        }).returning('*');

        await trx('users').insert({
          tenant_id: tenant.id,
          role: 'FRANCHISE_OWNER',
          name: ownerName,
          email: ownerEmail,
          phone: ownerPhone,
          password_hash: await hashPassword(ownerPassword),
          email_verified: true,
        });

        await trx('subscriptions').insert({
          tenant_id: tenant.id,
          plan_id: planId,
          billing_cycle: 'MONTHLY',
          starts_at: trx.fn.now(),
        });

        return tenant;
      });

      return result;
    },

    updateTenant: async (_p, { id, input }, ctx) => {
      const user = requireAuth(ctx);
      if (!PLATFORM_ROLES.includes(user.role) && user.tenantId !== id) {
        throw new GraphQLError('Not authorized.', { extensions: { code: 'FORBIDDEN' } });
      }

      const patch = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.phone !== undefined) patch.phone = input.phone;
      if (input.gstin !== undefined) patch.gstin = input.gstin;
      if (input.city !== undefined) patch.city = input.city;
      if (input.logoUrl !== undefined) patch.logo_url = input.logoUrl;
      // Only platform admins can change plan / commission directly:
      if (PLATFORM_ROLES.includes(user.role)) {
        if (input.planId !== undefined) patch.plan_id = input.planId;
        if (input.commissionRateOverride !== undefined) patch.commission_rate_override = input.commissionRateOverride;
      }

      const [updated] = await db('tenants').where('id', id).update(patch).returning('*');
      if (!updated) throw new GraphQLError('Tenant not found.', { extensions: { code: 'NOT_FOUND' } });
      return updated;
    },

    suspendTenant: async (_p, { id, reason }, ctx) => {
      requireRole(ctx, PLATFORM_ROLES);
      const [updated] = await db('tenants').where('id', id).update({
        status: 'SUSPENDED', suspended_at: db.fn.now(), suspension_reason: reason,
      }).returning('*');

      await db('audit_logs').insert({
        tenant_id: id, actor_id: ctx.user.id, actor_role: ctx.user.role,
        action: 'tenant.suspended', entity_type: 'tenant', entity_id: id,
        after_state: { reason },
      });

      return updated;
    },

    reactivateTenant: async (_p, { id }, ctx) => {
      requireRole(ctx, PLATFORM_ROLES);
      const [updated] = await db('tenants').where('id', id).update({
        status: 'ACTIVE', suspended_at: null, suspension_reason: null,
      }).returning('*');

      await db('audit_logs').insert({
        tenant_id: id, actor_id: ctx.user.id, actor_role: ctx.user.role,
        action: 'tenant.reactivated', entity_type: 'tenant', entity_id: id,
      });

      return updated;
    },

    changeTenantPlan: async (_p, { id, planId }, ctx) => {
      requireRole(ctx, PLATFORM_ROLES);
      const [updated] = await db.transaction(async (trx) => {
        const updatedRows = await trx('tenants').where('id', id).update({ plan_id: planId }).returning('*');
        await trx('subscriptions').insert({ tenant_id: id, plan_id: planId, billing_cycle: 'MONTHLY', starts_at: trx.fn.now() });
        return updatedRows;
      });
      return updated;
    },

    inviteStaff: async (_p, { name, email, phone }, ctx) => {
      const user = requireRole(ctx, ['FRANCHISE_OWNER']);

      const tenant = await db('tenants').where('id', user.tenantId).first();
      const plan = await db('plans').where('id', tenant.plan_id).first();
      const staffCount = await db('users').where({ tenant_id: user.tenantId }).whereNull('deleted_at').count('* as c').first();

      if (Number(staffCount.c) >= plan.max_staff_seats) {
        throw new GraphQLError(`Your ${plan.name} plan allows up to ${plan.max_staff_seats} staff seats. Upgrade to add more.`, {
          extensions: { code: 'PLAN_LIMIT_REACHED' },
        });
      }

      const tempPassword = nanoid(12);
      const [staff] = await db('users').insert({
        tenant_id: user.tenantId,
        role: 'FRANCHISE_STAFF',
        name, email, phone,
        password_hash: await hashPassword(tempPassword),
      }).returning('*');

      // TODO: send invite email with tempPassword / reset link
      console.log(`[staff-invite] ${email} temp password: ${tempPassword}`);

      return staff;
    },
  },

  Tenant: {
    plan: (tenant, _a, ctx) => (tenant.plan_id ? ctx.loaders.planById.load(tenant.plan_id) : null),
    billingEmail: (t) => t.billing_email,
    logoUrl: (t) => t.logo_url,
    trialEndsAt: (t) => t.trial_ends_at,
    currentPeriodStart: (t) => t.current_period_start,
    currentPeriodEnd: (t) => t.current_period_end,
    commissionRateOverride: (t) => t.commission_rate_override ? Number(t.commission_rate_override) : null,
    effectiveCommissionRate: async (t, _a, ctx) => {
      if (t.commission_rate_override != null) return Number(t.commission_rate_override);
      const plan = t.plan_id ? await ctx.loaders.planById.load(t.plan_id) : null;
      return plan ? Number(plan.commission_rate) : 4.0;
    },
    suspendedAt: (t) => t.suspended_at,
    suspensionReason: (t) => t.suspension_reason,
    createdAt: (t) => t.created_at,

    listingCount: async (t) => {
      const row = await db('properties').where({ tenant_id: t.id }).whereNull('deleted_at').count('* as c').first();
      return Number(row.c);
    },
    activeLeadCount: async (t) => {
      const row = await db('leads').where({ tenant_id: t.id }).whereNotIn('status', ['CONVERTED', 'LOST']).count('* as c').first();
      return Number(row.c);
    },
    staffCount: async (t) => {
      const row = await db('users').where({ tenant_id: t.id }).whereNull('deleted_at').count('* as c').first();
      return Number(row.c);
    },
    monthlyRevenuePaise: async (t) => {
      const row = await db('commission_ledger')
        .where({ tenant_id: t.id })
        .where('created_at', '>=', db.raw("date_trunc('month', now())"))
        .sum('commission_paise as sum').first();
      return Number(row.sum) || 0;
    },
  },

  Plan: {
    priceMonthlyPaise: (p) => p.price_monthly_paise,
    priceYearlyPaise: (p) => p.price_yearly_paise,
    maxListings: (p) => p.max_listings,
    maxStaffSeats: (p) => p.max_staff_seats,
    commissionRate: (p) => Number(p.commission_rate),
    isActive: (p) => p.is_active,
  },
};
