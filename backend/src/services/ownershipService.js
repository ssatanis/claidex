import { getNeo4jSession } from '../db/neo4j.js';

export async function getOwnershipGraph({ npi, entityId, depth = 2 }) {
  const session = await getNeo4jSession();
  try {
    if (npi) {
      const r = await session.run(
        `MATCH path = (p:Provider {npi: $npi})-[:OWNS|OWNED_BY*1..${Math.min(depth, 5)}]-(n)
         RETURN path LIMIT 500`,
        { npi }
      );
      return { nodes: [], edges: [] }; // TODO: map records to graph shape
    }
    if (entityId) {
      const r = await session.run(
        `MATCH path = (e:Entity {id: $id})-[:OWNS|OWNED_BY*1..${Math.min(depth, 5)}]-(n)
         RETURN path LIMIT 500`,
        { id: entityId }
      );
      return { nodes: [], edges: [] };
    }
    return { nodes: [], edges: [] };
  } finally {
    await session.close();
  }
}
