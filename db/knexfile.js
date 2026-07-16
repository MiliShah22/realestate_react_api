import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;
const NODE_ENV     = process.env.NODE_ENV || 'development';

/** @type {import('knex').Knex.Config} */
const config = {
  client: 'pg',
  connection: DATABASE_URL
    ? { connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : 'postgres://estatiq:estatiq_pass@localhost:5432/estatiq_dev',
  pool: {
    min: Number(process.env.DB_POOL_MIN || 2),
    max: Number(process.env.DB_POOL_MAX || 10),
    acquireTimeoutMillis: 30000,
    createTimeoutMillis:  30000,
    idleTimeoutMillis:    30000,
  },
  migrations: { directory: './migrations', tableName: 'knex_migrations', loadExtensions: ['.js'] },
  seeds:      { directory: './seeds',      loadExtensions: ['.js'] },
};

export default config;
