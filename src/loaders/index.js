import DataLoader from 'dataloader';
import db from '../db/connection.js';
import { withTenant } from '../db/withTenant.js';

/**
 * Creates a fresh set of DataLoaders per GraphQL request (per Apollo's
 * recommended pattern — loaders cache within a single request only,
 * never across requests, to avoid serving stale or cross-user data).
 */
export function createLoaders({ rls }) {
  return {
    userById: new DataLoader(async (ids) => {
      const rows = await db('users').whereIn('id', ids).whereNull('deleted_at');
      const byId = new Map(rows.map(r => [r.id, r]));
      return ids.map(id => byId.get(id) || null);
    }),

    tenantById: new DataLoader(async (ids) => {
      const rows = await db('tenants').whereIn('id', ids).whereNull('deleted_at');
      const byId = new Map(rows.map(r => [r.id, r]));
      return ids.map(id => byId.get(id) || null);
    }),

    planById: new DataLoader(async (ids) => {
      const rows = await db('plans').whereIn('id', ids);
      const byId = new Map(rows.map(r => [r.id, r]));
      return ids.map(id => byId.get(id) || null);
    }),

    propertyById: new DataLoader(async (ids) => {
      const rows = await withTenant(rls, (trx) =>
        trx('properties').whereIn('id', ids).whereNull('deleted_at')
      );
      const byId = new Map(rows.map(r => [r.id, r]));
      return ids.map(id => byId.get(id) || null);
    }),

    imagesByPropertyId: new DataLoader(async (propertyIds) => {
      const rows = await db('property_images')
        .whereIn('property_id', propertyIds)
        .orderBy(['property_id', 'sort_order']);
      const grouped = new Map();
      for (const row of rows) {
        if (!grouped.has(row.property_id)) grouped.set(row.property_id, []);
        grouped.get(row.property_id).push(row);
      }
      return propertyIds.map(id => grouped.get(id) || []);
    }),

    reviewCountByPropertyId: new DataLoader(async (propertyIds) => {
      const rows = await db('reviews')
        .select('property_id')
        .count('* as count')
        .avg('rating as avg_rating')
        .whereIn('property_id', propertyIds)
        .where('status', 'APPROVED')
        .groupBy('property_id');
      const byId = new Map(rows.map(r => [r.property_id, r]));
      return propertyIds.map(id => byId.get(id) || { count: 0, avg_rating: null });
    }),

    leadCountByPropertyId: new DataLoader(async (propertyIds) => {
      const rows = await withTenant(rls, (trx) =>
        trx('leads').select('property_id').count('* as count').whereIn('property_id', propertyIds).groupBy('property_id')
      );
      const byId = new Map(rows.map(r => [r.property_id, Number(r.count)]));
      return propertyIds.map(id => byId.get(id) || 0);
    }),
  };
}
