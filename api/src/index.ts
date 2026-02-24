import express, { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';

import { config } from './config';
import { verifyNeo4jConnectivity, closeNeo4j } from './db/neo4j';
import { verifyPostgresConnectivity, closePostgres } from './db/postgres';
import { apiRateLimit } from './middleware/rateLimit';
import { errorHandler, AppError } from './middleware/errorHandler';

import { providersRouter } from './routes/providers';
import { entitiesRouter }  from './routes/entities';
import { ownershipRouter } from './routes/ownership';
import { paymentsRouter }  from './routes/payments';
import { exclusionsRouter } from './routes/exclusions';
import { searchRouter }    from './routes/search';
import { riskRouter }      from './routes/risk';
import { benchmarkRouter } from './routes/benchmark';
import { politicalRouter } from './routes/political';
import { financialsRouter } from './routes/financials';
import { briefRouter } from './routes/brief';
import { metricsRouter } from './routes/metrics';
import { eventsRouter } from './routes/events';
import { watchlistRouter } from './routes/watchlist';
import { watchlistsRouter } from './routes/watchlists';
import { meRouter } from './routes/me';
import { authMe } from './middleware/authMe';

export const app = express();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

app.use(helmet());
// In production, restrict CORS to CORS_ORIGIN (comma-separated). In dev or when unset, allow all.
app.use(
  cors({
    origin:
      config.isProd && config.corsOrigins.length > 0
        ? config.corsOrigins
        : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(compression());
app.use(express.json());

// Logging: compact dev format vs structured JSON in production
if (config.isProd) {
  app.use(
    morgan('combined', {
      stream: { write: (msg) => process.stdout.write(JSON.stringify({ level: 'info', msg: msg.trim() }) + '\n') },
    })
  );
} else {
  app.use(morgan('dev'));
}

// ---------------------------------------------------------------------------
// Health endpoint (no rate limit — used by orchestrators)
// ---------------------------------------------------------------------------

app.get('/health', async (_req: Request, res: Response) => {
  const [neo4jOk, pgOk] = await Promise.all([
    verifyNeo4jConnectivity(),
    verifyPostgresConnectivity(),
  ]);

  const status = neo4jOk && pgOk ? 'ok' : 'degraded';

  res.status(status === 'ok' ? 200 : 503).json({
    status,
    neo4j:    neo4jOk ? 'connected' : 'error',
    postgres: pgOk    ? 'connected' : 'error',
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// ---------------------------------------------------------------------------
// API v1 routes (rate-limited)
// ---------------------------------------------------------------------------

app.use('/v1', apiRateLimit);

// Internal health check: Postgres SELECT 1 and Neo4j MATCH (n) RETURN 1 LIMIT 1
app.get('/v1/health', async (_req: Request, res: Response) => {
  let postgres: 'ok' | 'error' = 'error';
  let neo4j: 'ok' | 'error' = 'error';
  try {
    const { queryPg } = await import('./db/postgres');
    await queryPg('SELECT 1 AS one', []);
    postgres = 'ok';
  } catch {
    postgres = 'error';
  }
  try {
    const { runCypher } = await import('./db/neo4j');
    await runCypher('MATCH (n) RETURN 1 AS one LIMIT 1', {});
    neo4j = 'ok';
  } catch {
    neo4j = 'error';
  }
  const status = postgres === 'ok' && neo4j === 'ok' ? 'ok' : 'degraded';
  res.status(postgres === 'ok' ? 200 : 503).json({
    status,
    postgres,
    neo4j,
    uptime_seconds: Math.floor(process.uptime()),
  });
});

app.use('/v1/providers',  providersRouter);
app.use('/v1/providers',  riskRouter);
app.use('/v1/providers',  benchmarkRouter);
app.use('/v1/providers',  politicalRouter);
app.use('/v1/providers',  financialsRouter);
app.use('/v1/providers',  briefRouter);
app.use('/v1/entities',   entitiesRouter);
app.use('/v1/ownership',  ownershipRouter);
app.use('/v1/payments',   paymentsRouter);
app.use('/v1/exclusions', exclusionsRouter);
app.use('/v1/search',     searchRouter);
app.use('/v1/metrics',    metricsRouter);
app.use('/v1/events',     eventsRouter);
app.use('/v1/watchlist',  watchlistRouter);
app.use('/v1/watchlists', watchlistsRouter);
app.use('/v1/me', authMe, meRouter);

// 404 handler for unmatched routes
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError('NOT_FOUND', 'Route not found', 404));
});

// ---------------------------------------------------------------------------
// Global error handler (must be last)
// ---------------------------------------------------------------------------

app.use(errorHandler);

// ---------------------------------------------------------------------------
// Server startup (only when not running under tests)
// ---------------------------------------------------------------------------

if (require.main === module) {
  const host = '0.0.0.0';
  const server = app.listen(config.port, host, () => {
    console.log(`[api] Claidex API listening on ${host}:${config.port} (${config.nodeEnv})`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[api] Port ${config.port} is already in use. Run "npm start" to kill the existing process and start fresh.`);
      process.exit(1);
    }
    throw err;
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} received — shutting down gracefully`);
    server.close(async () => {
      await Promise.all([closeNeo4j(), closePostgres()]);
      console.log('[api] Closed DB connections. Exiting.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}
