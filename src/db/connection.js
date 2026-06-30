import knex from 'knex';
import knexConfig from '../../db/knexfile.js';

/**
 * Single shared Knex instance (connection pooled).
 * Used both for direct query building and as the base for
 * tenant-scoped query helpers (see db/withTenant.js).
 */
const db = knex(knexConfig);

export default db;
