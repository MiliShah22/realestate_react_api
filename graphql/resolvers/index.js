import { mergeResolvers } from '@graphql-tools/merge';

import { scalarResolvers } from './scalars.js';
import { authResolvers } from './auth.js';
import { tenantResolvers } from './tenant.js';
import { propertyResolvers } from './property.js';
import { leadResolvers } from './lead.js';
import { reviewResolvers } from './review.js';
import { savedSearchResolvers, reportResolvers } from './misc.js';

/**
 * @graphql-tools/merge deep-merges the Query/Mutation maps from every
 * domain resolver file into one object, and passes through type-level
 * resolvers (User, Property, Tenant, ...) untouched. This is what lets
 * each domain own its own `Query.foo` / `Mutation.bar` entries without
 * the files needing to know about each other.
 */
export const resolvers = mergeResolvers([
  scalarResolvers,
  authResolvers,
  tenantResolvers,
  propertyResolvers,
  leadResolvers,
  reviewResolvers,
  savedSearchResolvers,
  reportResolvers,
]);
