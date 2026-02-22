import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';

import { providersRouter } from './routes/providers.js';
import { entitiesRouter } from './routes/entities.js';
import { ownershipRouter } from './routes/ownership.js';
import { exclusionsRouter } from './routes/exclusions.js';
import { typeDefs } from './resolvers/schema.js';
import { resolvers } from './resolvers/index.js';

const app = express();
app.use(cors());
app.use(express.json());

// REST routes
app.use('/providers', providersRouter);
app.use('/entities', entitiesRouter);
app.use('/ownership', ownershipRouter);
app.use('/exclusions', exclusionsRouter);

// GraphQL
const apollo = new ApolloServer({ typeDefs, resolvers });
await apollo.start();
app.use('/graphql', expressMiddleware(apollo));

const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
  console.log(`Backend listening on ${PORT} (REST + GraphQL)`);
});
