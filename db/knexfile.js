import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

const DATABASE_URL = process.env.DATABASE_URL;
console.log({
  DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});
/** @type {import('knex').Knex.Config} */
const config = {
  client: 'pg',

  connection: {
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  },

  pool: {
    min: Number(process.env.DB_POOL_MIN || 2),
    max: Number(process.env.DB_POOL_MAX || 10),
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
  },

  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
    loadExtensions: ['.js'],
  },

  seeds: {
    directory: './seeds',
    loadExtensions: ['.js'],
  },
};

export default config;