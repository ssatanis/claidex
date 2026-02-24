import './load-env.js';
import express from 'express';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';

import { providersRouter } from './routes/providers.js';
import { entitiesRouter } from './routes/entities.js';
import { ownershipRouter } from './routes/ownership.js';
import { exclusionsRouter } from './routes/exclusions.js';
import { politicalRouter } from './routes/political.js';
import { financialsRouter } from './routes/financials.js';
import { watchlistRouter } from './routes/watchlist.js';
import { metricsRouter } from './routes/metrics.js';
import { eventsRouter } from './routes/events.js';
import { authMe } from './middleware/auth.js';
import { meRouter } from './routes/me.js';
import { typeDefs } from './resolvers/schema.js';
import { resolvers } from './resolvers/index.js';

const app = express();
app.use(cors());
app.use(express.json());

// Versioned REST routes (order matters: more specific after generic)
app.use('/v1/providers', providersRouter);
app.use('/v1/providers', financialsRouter);
app.use('/v1/providers', politicalRouter);
app.use('/v1/watchlist', watchlistRouter);
app.use('/v1/metrics', metricsRouter);
app.use('/v1/events', eventsRouter);

app.use('/v1/entities', entitiesRouter);
app.use('/v1/me', authMe, meRouter);

// REST routes
app.use('/providers', providersRouter);
app.use('/entities', entitiesRouter);
app.use('/ownership', ownershipRouter);
app.use('/exclusions', exclusionsRouter);

// GraphQL
const apollo = new ApolloServer({ typeDefs, resolvers });
await apollo.start();
app.use('/graphql', expressMiddleware(apollo));

const PORT = Number(process.env.PORT) || 4000;
const MAX_ATTEMPTS = 5;

function tryListen(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => resolve(server));
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') reject(err);
      else reject(err);
    });
  });
}

(async () => {
  let server;
  let boundPort = PORT;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const p = PORT + attempt;
    try {
      server = await tryListen(p);
      boundPort = p;
      console.log(`Backend listening on ${p} (REST + GraphQL)`);
      if (p !== PORT) {
        console.log(`\n  Port ${PORT} was in use. Update frontend to use this port:`);
        console.log(`  NEXT_PUBLIC_API_URL=http://localhost:${p}\n`);
      }
      break;
    } catch (err) {
      if (err.code === 'EADDRINUSE' && attempt < MAX_ATTEMPTS - 1) {
        console.warn(`Port ${p} in use, trying ${p + 1}...`);
        continue;
      }
      if (err.code === 'EADDRINUSE') {
        console.error(`Ports ${PORT}–${PORT + MAX_ATTEMPTS - 1} in use. Free one with:`);
        console.error(`  lsof -ti :${PORT} | xargs kill`);
        console.error(`Or set PORT=${PORT + MAX_ATTEMPTS} and restart.`);
        process.exit(1);
      }
      throw err;
    }
  }
})();
