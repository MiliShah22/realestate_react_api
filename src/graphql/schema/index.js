import { mergeTypeDefs } from '@graphql-tools/merge';

import { sharedTypeDefs } from './shared.js';
import { authTypeDefs } from './auth.js';
import { tenantTypeDefs } from './tenant.js';
import { propertyTypeDefs } from './property.js';
import { leadTypeDefs } from './lead.js';
import { reviewTypeDefs, savedSearchTypeDefs, reportTypeDefs } from './misc.js';

export const typeDefs = mergeTypeDefs([
  sharedTypeDefs,
  authTypeDefs,
  tenantTypeDefs,
  propertyTypeDefs,
  leadTypeDefs,
  reviewTypeDefs,
  savedSearchTypeDefs,
  reportTypeDefs,
]);
