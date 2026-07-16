import { GraphQLError } from 'graphql';
import db from '../../db/connection.js';
import { requireAuth, requireRole, PLATFORM_ROLES } from '../context.js';
import { paginationArgs, buildPageInfo } from '../../utils/format.js';

export const reviewResolvers = {
  Query: {
    reviews: async (_p, { filter, pagination }, ctx) => {
      requireRole(ctx, PLATFORM_ROLES);
      const { page, pageSize, offset, limit } = paginationArgs(pagination);

      let q = db('reviews');
      if (filter?.status) q = q.andWhere('status', filter.status);
      if (filter?.minRating) q = q.andWhere('rating', '>=', filter.minRating);
      if (filter?.propertyId) q = q.andWhere('property_id', filter.propertyId);
      if (filter?.search) q = q.andWhereILike('body', `%${filter.search}%`);

      const countRow = await q.clone().count('* as count').first();
      const items = await q.clone().orderBy('created_at', 'desc').offset(offset).limit(limit);

      return { items, pageInfo: buildPageInfo({ page, pageSize, totalCount: Number(countRow.count) }) };
    },
    myReviews: async (_p, { pagination }, ctx) => {
      const user = requireAuth(ctx);
      const { page, pageSize, offset, limit } = paginationArgs(pagination);

      const base = db('reviews').where('user_id', user.id);

      const countRow = await base.clone().count('* as count').first();

      const items = await base
        .clone()
        .orderBy('created_at', 'desc')
        .offset(offset)
        .limit(limit);

      return {
        items,
        pageInfo: buildPageInfo({
          page,
          pageSize,
          totalCount: Number(countRow.count),
        }),
      };
    },
    propertyReviews: async (_p, { propertyId, pagination }) => {
      const { page, pageSize, offset, limit } = paginationArgs(pagination);
      const base = db('reviews').where({ property_id: propertyId, status: 'APPROVED' });
      const countRow = await base.clone().count('* as count').first();
      const items = await base.clone().orderBy('created_at', 'desc').offset(offset).limit(limit);
      return { items, pageInfo: buildPageInfo({ page, pageSize, totalCount: Number(countRow.count) }) };
    },
  },

  Mutation: {
    createReview: async (_p, { propertyId, rating, body }, ctx) => {
      const user = requireAuth(ctx);
      if (rating < 1 || rating > 5) throw new GraphQLError('Rating must be between 1 and 5.', { extensions: { code: 'BAD_USER_INPUT' } });

      const property = await db('properties').where('id', propertyId).first();
      if (!property) throw new GraphQLError('Property not found.', { extensions: { code: 'NOT_FOUND' } });

      const existing = await db('reviews').where({ property_id: propertyId, user_id: user.id }).first();
      if (existing) throw new GraphQLError('You have already reviewed this property.', { extensions: { code: 'CONFLICT' } });

      const [review] = await db('reviews').insert({
        tenant_id: property.tenant_id, property_id: propertyId, user_id: user.id, rating, body, status: 'PENDING',
      }).returning('*');

      return review;
    },

    moderateReview: async (_p, { id, status }, ctx) => {
      const user = requireRole(ctx, PLATFORM_ROLES);
      const [updated] = await db('reviews').where('id', id).update({
        status, moderated_by: user.id, moderated_at: db.fn.now(),
      }).returning('*');

      if (!updated) throw new GraphQLError('Review not found.', { extensions: { code: 'NOT_FOUND' } });

      // Refresh the property's aggregate rating whenever a review is approved/un-approved.
      const agg = await db('reviews').where({ property_id: updated.property_id, status: 'APPROVED' }).avg('rating as avg').first();
      await db('properties').where('id', updated.property_id).update({ rating: agg.avg || 0 });

      return updated;
    },

    deleteReview: async (_p, { id }, ctx) => {
      requireRole(ctx, PLATFORM_ROLES);
      await db('reviews').where('id', id).del();
      return { success: true, message: 'Review deleted.' };
    },
  },

  Review: {
    property: (r, _a, ctx) => ctx.loaders.propertyById.load(r.property_id),
    user: (r, _a, ctx) => ctx.loaders.userById.load(r.user_id),
    moderatedBy: (r, _a, ctx) => (r.moderated_by ? ctx.loaders.userById.load(r.moderated_by) : null),
    moderatedAt: (r) => r.moderated_at,
    createdAt: (r) => r.created_at,
  },
};
