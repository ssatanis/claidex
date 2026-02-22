import pg from 'pg';

const { Pool } = pg;

export const postgresPool = new Pool({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB ?? 'claidex',
  user: process.env.POSTGRES_USER ?? 'claidex',
  password: process.env.POSTGRES_PASSWORD ?? '',
});
