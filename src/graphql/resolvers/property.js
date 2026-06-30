import { GraphQLError } from 'graphql';
import db from '../../db/connection.js';
import { withTenant } from '../../db/withTenant.js';
import { requireAuth, requireRole, PLATFORM_ROLES, FRANCHISE_ROLES } from '../context.js';
import { paginationArgs, buildPageInfo, formatPaiseToInr } from '../../utils/format.js';

function applyPropertyFilters(q, filter = {}) {
  if (filter.city) q = q.andWhereILike('city', `%${filter.city}%`);
  if (filter.locality) q = q.andWhereILike('locality', `%${filter.locality}%`);
  if (filter.listingType) q = q.andWhere('listing_type', filter.listingType);
  if (filter.propertyType) q = q.andWhere('property_type', filter.propertyType);
  if (filter.bhk?.length) q = q.whereIn('bhk', filter.bhk);
  if (filter.minPrice != null) q = q.andWhere('price_paise', '>=', filter.minPrice);
  if (filter.maxPrice != null) q = q.andWhere('price_paise', '<=', filter.maxPrice);
  if (filter.minAreaSqft != null) q = q.andWhere('carpet_area_sqft', '>=', filter.minAreaSqft);
  if (filter.maxAreaSqft != null) q = q.andWhere('carpet_area_sqft', '<=', filter.maxAreaSqft);
  if (filter.possessionStatus) q = q.andWhere('possession_status', filter.possessionStatus);
  if (filter.isFeatured != null) q = q.andWhere('is_featured', filter.isFeatured);
  if (filter.status) q = q.andWhere('status', filter.status);
  if (filter.tenantId) q = q.andWhere('tenant_id', filter.tenantId);
  if (filter.amenities?.length) q = q.andWhere('amenities', '@>', JSON.stringify(filter.amenities));
  if (filter.search) q = q.andWhereRaw(`search_vector @@ plainto_tsquery('english', ?)`, [filter.search]);
  return q;
}

const SORT_COLUMN = { PRICE: 'price_paise', CREATED_AT: 'created_at', VIEW_COUNT: 'view_count', RATING: 'rating' };

export const propertyResolvers = {
  Query: {
    /**
     * Public search endpoint — visible to anonymous customers, so it must
     * default to ACTIVE-only and bypass tenant scoping (a buyer searches
     * across ALL franchise tenants at once). We deliberately query `db`
     * directly here rather than `withTenant`, since this is intentionally
     * cross-tenant — the one query in the schema that *should* see
     * everyone's ACTIVE listings.
     */
    properties: async (_p, { filter, sort, pagination }, ctx) => {
      const { page, pageSize, offset, limit } = paginationArgs(pagination);
      const isStaffQuery = ctx.user && (PLATFORM_ROLES.includes(ctx.user.role) || FRANCHISE_ROLES.includes(ctx.user.role));

      let q = db('properties').whereNull('deleted_at');

      // Public/customer queries only ever see ACTIVE listings, regardless of `filter.status`.
      if (!isStaffQuery) {
        q = q.andWhere('status', 'ACTIVE');
        delete filter?.status;
      } else if (filter?.tenantId) {
        // Franchise staff querying their own tenant: enforce scope via RLS (see below)
      }

      q = applyPropertyFilters(q, filter || {});

      const sortCol = SORT_COLUMN[sort?.field || 'CREATED_AT'];
      const direction = (sort?.direction || 'DESC').toLowerCase();

      const run = async (trx) => {
        const base = trx ? trx('properties').whereNull('deleted_at') : q;
        const finalQ = trx ? applyPropertyFilters(isStaffQuery ? base : base.andWhere('status', 'ACTIVE'), filter || {}) : q;
        const countRow = await finalQ.clone().count('* as count').first();
        const items = await finalQ.clone().orderBy(sortCol, direction).offset(offset).limit(limit);
        return { items, totalCount: Number(countRow.count) };
      };

      // Franchise/admin staff queries go through RLS so they only see their tenant's
      // rows (admins bypass automatically per the RLS policy).
      const result = isStaffQuery ? await withTenant(ctx.rls, run) : await run(null);

      return { items: result.items, pageInfo: buildPageInfo({ page, pageSize, totalCount: result.totalCount }) };
    },

    property: async (_p, { id }, ctx) => {
      const isStaff = ctx.user && (PLATFORM_ROLES.includes(ctx.user.role) || FRANCHISE_ROLES.includes(ctx.user.role));
      if (isStaff) {
        const [row] = await withTenant(ctx.rls, (trx) => trx('properties').where('id', id).whereNull('deleted_at'));
        return row || null;
      }
      return db('properties').where({ id, status: 'ACTIVE' }).whereNull('deleted_at').first();
    },

    savedProperties: async (_p, { pagination }, ctx) => {
      const user = requireAuth(ctx);
      const { page, pageSize, offset, limit } = paginationArgs(pagination);

      const base = db('properties')
        .join('saved_properties', 'saved_properties.property_id', 'properties.id')
        .where('saved_properties.user_id', user.id)
        .whereNull('properties.deleted_at')
        .select('properties.*');

      const countRow = await base.clone().count('properties.id as count').first();
      const items = await base.clone().orderBy('saved_properties.created_at', 'desc').offset(offset).limit(limit);

      return { items, pageInfo: buildPageInfo({ page, pageSize, totalCount: Number(countRow.count) }) };
    },

    featuredProperties: async (_p, { limit }) =>
      db('properties').where({ status: 'ACTIVE', is_featured: true }).whereNull('deleted_at').orderBy('created_at', 'desc').limit(limit),

    similarProperties: async (_p, { propertyId, limit }) => {
      const base = await db('properties').where('id', propertyId).first();
      if (!base) return [];
      return db('properties')
        .where({ status: 'ACTIVE', city: base.city, property_type: base.property_type })
        .whereNot('id', propertyId)
        .whereNull('deleted_at')
        .limit(limit);
    },
  },

  Mutation: {
    createProperty: async (_p, { input }, ctx) => {
      const user = requireRole(ctx, FRANCHISE_ROLES);

      // Enforce plan listing limits
      const tenant = await db('tenants').where('id', user.tenantId).first();
      const plan = await db('plans').where('id', tenant.plan_id).first();
      const countRow = await db('properties').where({ tenant_id: user.tenantId }).whereNull('deleted_at').count('* as c').first();
      if (Number(countRow.c) >= plan.max_listings) {
        throw new GraphQLError(`Your ${plan.name} plan allows up to ${plan.max_listings} listings. Upgrade to add more.`, {
          extensions: { code: 'PLAN_LIMIT_REACHED' },
        });
      }

      const [property] = await withTenant(ctx.rls, (trx) =>
        trx('properties').insert({
          tenant_id: user.tenantId,
          created_by: user.id,
          assigned_agent_id: input.assignedAgentId || user.id,
          title: input.title,
          description: input.description,
          listing_type: input.listingType,
          property_type: input.propertyType,
          status: 'DRAFT',
          bhk: input.bhk,
          carpet_area_sqft: input.carpetAreaSqft,
          builtup_area_sqft: input.builtupAreaSqft,
          price_paise: input.pricePaise,
          maintenance_paise: input.maintenancePaise,
          possession_status: input.possessionStatus,
          possession_date: input.possessionDate,
          address_line: input.addressLine,
          locality: input.locality,
          city: input.city,
          state: input.state,
          pincode: input.pincode,
          latitude: input.latitude,
          longitude: input.longitude,
          builder_name: input.builderName,
          amenities: JSON.stringify(input.amenities || []),
        }).returning('*')
      );

      return property;
    },

    updateProperty: async (_p, { id, input }, ctx) => {
      requireRole(ctx, [...FRANCHISE_ROLES, ...PLATFORM_ROLES]);

      const patch = {};
      const map = {
        title: 'title', description: 'description', listingType: 'listing_type', propertyType: 'property_type',
        bhk: 'bhk', carpetAreaSqft: 'carpet_area_sqft', builtupAreaSqft: 'builtup_area_sqft',
        pricePaise: 'price_paise', maintenancePaise: 'maintenance_paise', possessionStatus: 'possession_status',
        possessionDate: 'possession_date', addressLine: 'address_line', locality: 'locality', city: 'city',
        state: 'state', pincode: 'pincode', latitude: 'latitude', longitude: 'longitude', builderName: 'builder_name',
        assignedAgentId: 'assigned_agent_id',
      };
      for (const [gqlKey, col] of Object.entries(map)) {
        if (input[gqlKey] !== undefined) patch[col] = input[gqlKey];
      }
      if (input.amenities !== undefined) patch.amenities = JSON.stringify(input.amenities);

      const [updated] = await withTenant(ctx.rls, (trx) => trx('properties').where('id', id).update(patch).returning('*'));
      if (!updated) throw new GraphQLError('Property not found or not accessible.', { extensions: { code: 'NOT_FOUND' } });
      return updated;
    },

    deleteProperty: async (_p, { id }, ctx) => {
      requireRole(ctx, [...FRANCHISE_ROLES, ...PLATFORM_ROLES]);
      const [updated] = await withTenant(ctx.rls, (trx) =>
        trx('properties').where('id', id).update({ deleted_at: trx.fn.now() }).returning('id')
      );
      if (!updated) throw new GraphQLError('Property not found.', { extensions: { code: 'NOT_FOUND' } });
      return { success: true, message: 'Property deleted.' };
    },

    submitPropertyForReview: async (_p, { id }, ctx) => {
      requireRole(ctx, FRANCHISE_ROLES);
      const [updated] = await withTenant(ctx.rls, (trx) =>
        trx('properties').where({ id, status: 'DRAFT' }).update({ status: 'PENDING_REVIEW' }).returning('*')
      );
      if (!updated) throw new GraphQLError('Property must be in DRAFT status to submit for review.', { extensions: { code: 'BAD_USER_INPUT' } });
      return updated;
    },

    setPropertyStatus: async (_p, { id, status, reason }, ctx) => {
      requireRole(ctx, PLATFORM_ROLES);

      const before = await db('properties').where('id', id).first();
      const patch = { status };
      if (status === 'ACTIVE' && !before.published_at) patch.published_at = db.fn.now();

      const [updated] = await db('properties').where('id', id).update(patch).returning('*');

      await db('audit_logs').insert({
        tenant_id: updated.tenant_id, actor_id: ctx.user.id, actor_role: ctx.user.role,
        action: 'property.status_changed', entity_type: 'property', entity_id: id,
        before_state: { status: before.status }, after_state: { status, reason },
      });

      return updated;
    },

    setPropertyFeatured: async (_p, { id, isFeatured }, ctx) => {
      requireRole(ctx, PLATFORM_ROLES);
      const [updated] = await db('properties').where('id', id).update({ is_featured: isFeatured }).returning('*');
      return updated;
    },

    setPropertyVerified: async (_p, { id, isVerified }, ctx) => {
      requireRole(ctx, PLATFORM_ROLES);
      const [updated] = await db('properties').where('id', id).update({ is_verified: isVerified }).returning('*');
      return updated;
    },

    addPropertyImages: async (_p, { propertyId, urls }, ctx) => {
      requireRole(ctx, [...FRANCHISE_ROLES, ...PLATFORM_ROLES]);
      await db('property_images').insert(
        urls.map((url, i) => ({ property_id: propertyId, url, sort_order: i }))
      );
      return db('properties').where('id', propertyId).first();
    },

    removePropertyImage: async (_p, { imageId }, ctx) => {
      requireRole(ctx, [...FRANCHISE_ROLES, ...PLATFORM_ROLES]);
      await db('property_images').where('id', imageId).del();
      return { success: true, message: 'Image removed.' };
    },

    setCoverImage: async (_p, { imageId }, ctx) => {
      requireRole(ctx, [...FRANCHISE_ROLES, ...PLATFORM_ROLES]);
      const image = await db('property_images').where('id', imageId).first();
      if (!image) throw new GraphQLError('Image not found.', { extensions: { code: 'NOT_FOUND' } });
      await db.transaction(async (trx) => {
        await trx('property_images').where('property_id', image.property_id).update({ is_cover: false });
        await trx('property_images').where('id', imageId).update({ is_cover: true });
      });
      return { success: true, message: 'Cover image updated.' };
    },

    toggleSaveProperty: async (_p, { propertyId }, ctx) => {
      const user = requireAuth(ctx);
      const existing = await db('saved_properties').where({ user_id: user.id, property_id: propertyId }).first();
      if (existing) {
        await db('saved_properties').where('id', existing.id).del();
        return false;
      }
      await db('saved_properties').insert({ user_id: user.id, property_id: propertyId });
      return true;
    },

    recordPropertyView: async (_p, { propertyId }) => {
      await db('properties').where('id', propertyId).increment('view_count', 1);
      return { success: true };
    },
  },

  Property: {
    tenant: (p, _a, ctx) => ctx.loaders.tenantById.load(p.tenant_id),
    createdBy: (p, _a, ctx) => (p.created_by ? ctx.loaders.userById.load(p.created_by) : null),
    assignedAgent: (p, _a, ctx) => (p.assigned_agent_id ? ctx.loaders.userById.load(p.assigned_agent_id) : null),
    listingType: (p) => p.listing_type,
    propertyType: (p) => p.property_type,
    carpetAreaSqft: (p) => p.carpet_area_sqft != null ? Number(p.carpet_area_sqft) : null,
    builtupAreaSqft: (p) => p.builtup_area_sqft != null ? Number(p.builtup_area_sqft) : null,
    pricePaise: (p) => p.price_paise,
    priceDisplay: (p) => formatPaiseToInr(p.price_paise),
    pricePerSqftPaise: (p) => p.price_per_sqft_paise,
    maintenancePaise: (p) => p.maintenance_paise,
    possessionStatus: (p) => p.possession_status,
    possessionDate: (p) => p.possession_date,
    addressLine: (p) => p.address_line,
    builderName: (p) => p.builder_name,
    rating: (p) => p.rating != null ? Number(p.rating) : null,
    reviewCount: async (p, _a, ctx) => {
      const stats = await ctx.loaders.reviewCountByPropertyId.load(p.id);
      return Number(stats.count) || 0;
    },
    isFeatured: (p) => p.is_featured,
    isVerified: (p) => p.is_verified,
    viewCount: (p) => p.view_count,
    leadCount: (p, _a, ctx) => ctx.loaders.leadCountByPropertyId.load(p.id),
    amenities: (p) => (Array.isArray(p.amenities) ? p.amenities : JSON.parse(p.amenities || '[]')),
    images: (p, _a, ctx) => ctx.loaders.imagesByPropertyId.load(p.id),
    publishedAt: (p) => p.published_at,
    createdAt: (p) => p.created_at,
  },

  PropertyImage: {
    altText: (i) => i.alt_text,
    sortOrder: (i) => i.sort_order,
    isCover: (i) => i.is_cover,
  },
};
