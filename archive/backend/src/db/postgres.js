import pg from 'pg';

const { Pool } = pg;

// Prefer POSTGRES_URL connection string (works with Neon or Docker), fall back to individual env vars
const postgresUrl = process.env.POSTGRES_URL;

const poolConfig = postgresUrl
  ? { connectionString: postgresUrl }
  : (() => {
      const password = process.env.POSTGRES_PASSWORD ?? '';
      if (!password) {
        console.warn('[postgres] WARNING: POSTGRES_PASSWORD is empty. Database connection may fail.');
      }
      return {
        host: process.env.POSTGRES_HOST ?? 'localhost',
        port: Number(process.env.POSTGRES_PORT) || 5432,
        database: process.env.POSTGRES_DB ?? 'claidex',
        user: process.env.POSTGRES_USER ?? 'claidex',
        password,
      };
    })();

export const postgresPool = new Pool(poolConfig);
