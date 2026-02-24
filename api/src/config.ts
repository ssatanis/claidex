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

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[config] Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

// Resolve a usable postgres connection string.
// Priority: explicit DATABASE_URL > local POSTGRES_URL > cloud NEON_PROVIDERS_URL
// This ensures the local Docker Postgres (port 5433) is used in development
// when POSTGRES_URL is set, even if NEON_PROVIDERS_URL is also present in .env.
const {
  NODE_ENV,
  PORT,
  CORS_ORIGIN,
  NEO4J_URI,
  NEO4J_USER,
  NEO4J_PASSWORD,
  DATABASE_URL,
  NEON_PROVIDERS_URL,
  POSTGRES_URL,
} = env;

const pgUrl = DATABASE_URL ?? POSTGRES_URL ?? NEON_PROVIDERS_URL ?? null;

if (!pgUrl && NODE_ENV !== 'test') {
  console.error('[config] No Postgres URL found. Set DATABASE_URL, NEON_PROVIDERS_URL, or POSTGRES_URL.');
  process.exit(1);
}

// Parse CORS origins: comma-separated list, trimmed; empty in dev allows all.
const corsOrigins: string[] = CORS_ORIGIN
  ? CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

export const config = {
  nodeEnv: NODE_ENV,
  port: PORT,
  corsOrigins,
  neo4j: {
    uri: NEO4J_URI,
    user: NEO4J_USER,
    password: NEO4J_PASSWORD,
  },
  pgUrl: pgUrl ?? '',
  isDev: NODE_ENV === 'development',
  isProd: NODE_ENV === 'production',
  isTest: NODE_ENV === 'test',
};
