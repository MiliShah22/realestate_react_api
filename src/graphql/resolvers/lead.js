import { GraphQLError } from 'graphql';
import db from '../../db/connection.js';
import { withTenant } from '../../db/withTenant.js';
import { requireAuth, requireRole, PLATFORM_ROLES, FRANCHISE_ROLES } from '../context.js';
import { paginationArgs, buildPageInfo } from '../../utils/format.js';

export const leadResolvers = {
  Query: {
    leads: async (_p, { filter, pagination }, ctx) => {
      requireRole(ctx, [...FRANCHISE_ROLES, ...PLATFORM_ROLES]);
      const { page, pageSize, offset, limit } = paginationArgs(pagination);

      const result = await withTenant(ctx.rls, async (trx) => {
        let q = trx('leads');
        if (filter?.status) q = q.andWhere('status', filter.status);
        if (filter?.propertyId) q = q.andWhere('property_id', filter.propertyId);
        if (filter?.assignedAgentId) q = q.andWhere('assigned_agent_id', filter.assignedAgentId);
        if (filter?.city) q = q.andWhereILike('city', `%${filter.city}%`);
        if (filter?.search) {
          q = q.andWhere((b) => b.whereILike('contact_name', `%${filter.search}%`).orWhereILike('contact_email', `%${filter.search}%`));
        }
        const countRow = await q.clone().count('* as count').first();
        const items = await q.clone().orderBy('created_at', 'desc').offset(offset).limit(limit);
        return { items, totalCount: Number(countRow.count) };
      });

      return { items: result.items, pageInfo: buildPageInfo({ page, pageSize, totalCount: result.totalCount }) };
    },

    lead: async (_p, { id }, ctx) => {
      requireRole(ctx, [...FRANCHISE_ROLES, ...PLATFORM_ROLES]);
      const [row] = await withTenant(ctx.rls, (trx) => trx('leads').where('id', id));
      return row || null;
    },

    myEnquiries: async (_p, { pagination }, ctx) => {
      const user = requireAuth(ctx);
      const { page, pageSize, offset, limit } = paginationArgs(pagination);

      // Customers aren't tenant-scoped, so this intentionally bypasses RLS
      // (acts as platform admin context) but filters by customer_id instead.
      const base = db('leads').where('customer_id', user.id);
      const countRow = await base.clone().count('* as count').first();
      const items = await base.clone().orderBy('created_at', 'desc').offset(offset).limit(limit);

      return { items, pageInfo: buildPageInfo({ page, pageSize, totalCount: Number(countRow.count) }) };
    },

    leadStats: async (_p, _a, ctx) => {
      requireRole(ctx, [...FRANCHISE_ROLES, ...PLATFORM_ROLES]);
      const rows = await withTenant(ctx.rls, (trx) =>
        trx('leads').select('status').count('* as count').groupBy('status')
      );
      const byStatus = Object.fromEntries(rows.map(r => [r.status, Number(r.count)]));
      const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
      return {
        total,
        new: byStatus.NEW || 0,
        contacted: byStatus.CONTACTED || 0,
        followUp: byStatus.FOLLOW_UP || 0,
        converted: byStatus.CONVERTED || 0,
        lost: byStatus.LOST || 0,
      };
    },
  },

  Mutation: {
    createLead: async (_p, { input }, ctx) => {
      const property = await db('properties').where('id', input.propertyId).where('status', 'ACTIVE').first();
      if (!property) throw new GraphQLError('Property not found or not available.', { extensions: { code: 'NOT_FOUND' } });

      const [lead] = await db('leads').insert({
        tenant_id: property.tenant_id,
        property_id: property.id,
        customer_id: ctx.user?.id || null,
        assigned_agent_id: property.assigned_agent_id,
        contact_name: input.contactName,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        budget_label: input.budgetLabel,
        message: input.message,
        source: input.source || 'SEARCH',
        city: property.city,
      }).returning('*');

      await db('lead_status_events').insert({
        lead_id: lead.id, changed_by: ctx.user?.id || null, to_status: 'NEW',
      });

      return lead;
    },

    updateLeadStatus: async (_p, { id, status, note }, ctx) => {
      const user = requireRole(ctx, [...FRANCHISE_ROLES, ...PLATFORM_ROLES]);

      const result = await withTenant(ctx.rls, async (trx) => {
        const before = await trx('leads').where('id', id).first();
        if (!before) throw new GraphQLError('Lead not found.', { extensions: { code: 'NOT_FOUND' } });

        const patch = { status };
        if (status === 'CONTACTED' && !before.contacted_at) patch.contacted_at = trx.fn.now();
        if (status === 'CONVERTED') patch.converted_at = trx.fn.now();

        const [updated] = await trx('leads').where('id', id).update(patch).returning('*');

        await trx('lead_status_events').insert({
          lead_id: id, changed_by: user.id, from_status: before.status, to_status: status, note,
        });

        return updated;
      });

      return result;
    },

    assignLead: async (_p, { id, agentId }, ctx) => {
      requireRole(ctx, [...FRANCHISE_ROLES, ...PLATFORM_ROLES]);
      const [updated] = await withTenant(ctx.rls, (trx) =>
        trx('leads').where('id', id).update({ assigned_agent_id: agentId }).returning('*')
      );
      if (!updated) throw new GraphQLError('Lead not found.', { extensions: { code: 'NOT_FOUND' } });
      return updated;
    },

    addLeadNote: async (_p, { id, note }, ctx) => {
      requireRole(ctx, [...FRANCHISE_ROLES, ...PLATFORM_ROLES]);
      const [updated] = await withTenant(ctx.rls, (trx) =>
        trx('leads').where('id', id).update({ internal_notes: note }).returning('*')
      );
      return updated;
    },

    deleteLead: async (_p, { id }, ctx) => {
      requireRole(ctx, [...FRANCHISE_ROLES, ...PLATFORM_ROLES]);
      await withTenant(ctx.rls, (trx) => trx('leads').where('id', id).del());
      return { success: true, message: 'Lead deleted.' };
    },
  },

  Lead: {
    tenant: (l, _a, ctx) => ctx.loaders.tenantById.load(l.tenant_id),
    property: (l, _a, ctx) => (l.property_id ? ctx.loaders.propertyById.load(l.property_id) : null),
    customer: (l, _a, ctx) => (l.customer_id ? ctx.loaders.userById.load(l.customer_id) : null),
    assignedAgent: (l, _a, ctx) => (l.assigned_agent_id ? ctx.loaders.userById.load(l.assigned_agent_id) : null),
    contactName: (l) => l.contact_name,
    contactEmail: (l) => l.contact_email,
    contactPhone: (l) => l.contact_phone,
    budgetLabel: (l) => l.budget_label,
    budgetPaise: (l) => l.budget_paise,
    internalNotes: (l) => l.internal_notes,
    history: (l) => db('lead_status_events').where('lead_id', l.id).orderBy('created_at', 'asc'),
    contactedAt: (l) => l.contacted_at,
    convertedAt: (l) => l.converted_at,
    createdAt: (l) => l.created_at,
  },

  LeadStatusEvent: {
    fromStatus: (e) => e.from_status,
    toStatus: (e) => e.to_status,
    changedBy: (e, _a, ctx) => (e.changed_by ? ctx.loaders.userById.load(e.changed_by) : null),
    createdAt: (e) => e.created_at,
  },
};
