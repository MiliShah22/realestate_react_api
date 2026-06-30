import 'dotenv/config';

/** @type {import('knex').Knex.Config} */
const config = {
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgresql://estatiq:LHBVtThxzZBbWvCgbt06aSeVAQt1240Q@dpg-d91qlrbsq97s73dni55g-a.oregon-postgres.render.com/estatiq_dev?sslmode=require',
  pool: {
    min: Number(process.env.DB_POOL_MIN || 2),
    max: Number(process.env.DB_POOL_MAX || 10),
  },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './seeds',
  },
};

export default config;
