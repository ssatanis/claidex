import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env from repo root so API works when run from api/ or repo root
const repoRootEnv = path.resolve(__dirname, '../../.env');
if (fs.existsSync(repoRootEnv)) {
  dotenv.config({ path: repoRootEnv });
} else {
  dotenv.config({ path: path.join(process.cwd(), '.env') });
  dotenv.config({ path: path.join(process.cwd(), '..', '.env') });
}

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4001),

  // CORS — in production set CORS_ORIGIN (comma-separated) to allow only your frontend origin(s)
  CORS_ORIGIN: z.string().optional(),

  // Neo4j
  NEO4J_URI: z.string().min(1),
  NEO4J_USER: z.string().default('neo4j'),
  NEO4J_PASSWORD: z.string().min(1),

  // Postgres — prefer Neon PROVIDERS URL, fall back to local POSTGRES_URL
  // Never log DATABASE_URL, POSTGRES_URL, or NEON_* — credentials must not appear in logs.
  DATABASE_URL: z.string().optional(),
  NEON_PROVIDERS_URL: z.string().optional(),
  POSTGRES_URL: z.string().optional(),
});

// Validate env at startup; Vercel's bundler rejects env/parsed variable references in exports
(function validateEnv() {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[config] Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
})();

if (
  !process.env.DATABASE_URL &&
  !process.env.POSTGRES_URL &&
  !process.env.NEON_PROVIDERS_URL &&
  process.env.NODE_ENV !== 'test'
) {
  console.error('[config] No Postgres URL found. Set DATABASE_URL, NEON_PROVIDERS_URL, or POSTGRES_URL.');
  process.exit(1);
}

// Export config via getters — Vercel bundler chokes on env.X, intermediate vars, ?? with env
export const config = {
  get nodeEnv() {
    return process.env.NODE_ENV;
  },
  get port() {
    return Number(process.env.PORT) || 4001;
  },
  get corsOrigins(): string[] {
    const c = process.env.CORS_ORIGIN;
    return c ? c.split(',').map((o) => o.trim()).filter(Boolean) : [];
  },
  neo4j: {
    get uri() {
      return process.env.NEO4J_URI!;
    },
    get user() {
      return process.env.NEO4J_USER || 'neo4j';
    },
    get password() {
      return process.env.NEO4J_PASSWORD!;
    },
  },
  get pgUrl() {
    return (
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.NEON_PROVIDERS_URL ||
      ''
    );
  },
  get isDev() {
    return process.env.NODE_ENV === 'development';
  },
  get isProd() {
    return process.env.NODE_ENV === 'production';
  },
  get isTest() {
    return process.env.NODE_ENV === 'test';
  },
};
