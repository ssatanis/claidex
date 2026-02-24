import { getNeo4jSession } from '../db/neo4j.js';
import { postgresPool } from '../db/postgres.js';

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

/**
 * Returns ownership summary for a provider: ultimate parent, PE flag, chain size, excluded peers.
 * Uses Neo4j when Provider is linked to CorporateEntity; otherwise tries Postgres corporate_entities.
 */
export async function getOwnershipSummary(npi) {
  const out = {
    ultimate_parent: null,
    ultimate_parent_entity_id: null,
    pe_backed: false,
    chain_size: 0,
    excluded_peers: 0,
  };

  try {
    const session = await getNeo4jSession();
    try {
      // Provider linked to entity via CONTROLLED_BY/OWNS. OWNS is (owner)->(snf); ultimate = top (no incoming OWNS).
      const chainResult = await session.run(
        `MATCH (p:Provider {npi: $npi})-[:CONTROLLED_BY|OWNS*0..1]->(start:CorporateEntity)
         WITH start
         OPTIONAL MATCH path = (start)<-[:OWNS*0..10]-(ultimate:CorporateEntity)
         WHERE NOT ()-[:OWNS]->(ultimate)
         WITH ultimate, path
         ORDER BY length(path) DESC
         LIMIT 1
         RETURN ultimate.entity_id AS entity_id, ultimate.name AS name`,
        { npi }
      );
      const chainRecord = chainResult.records[0];
      if (chainRecord && chainRecord.get('entity_id')) {
        out.ultimate_parent_entity_id = chainRecord.get('entity_id');
        out.ultimate_parent = chainRecord.get('name');
      }

      // Count entities in chain (start + all connected via OWNS)
      const countResult = await session.run(
        `MATCH (p:Provider {npi: $npi})-[:CONTROLLED_BY|OWNS*0..1]->(start:CorporateEntity)
         OPTIONAL MATCH (start)-[:OWNS*0..10]-(e:CorporateEntity)
         WITH count(DISTINCT e) + 1 AS chain_size
         RETURN chain_size`,
        { npi }
      );
      const countRecord = countResult.records[0];
      if (countRecord) {
        const size = countRecord.get('chain_size');
        out.chain_size = typeof size === 'number' ? size : (size?.toNumber?.() ?? 0);
      }

      // Excluded peers: providers in same ownership chain with EXCLUDED_BY
      const excludedResult = await session.run(
        `MATCH (p:Provider {npi: $npi})-[:CONTROLLED_BY|OWNS*0..1]->(e:CorporateEntity)
         MATCH (e)-[:OWNS*0..10]-(peerEntity:CorporateEntity)
         MATCH (peer:Provider)-[:CONTROLLED_BY|OWNS*0..1]->(peerEntity)
         WHERE peer.npi <> $npi AND (peer)-[:EXCLUDED_BY]->()
         RETURN count(DISTINCT peer) AS excluded_peers`,
        { npi }
      );
      const excludedRecord = excludedResult.records[0];
      if (excludedRecord) {
        const n = excludedRecord.get('excluded_peers');
        out.excluded_peers = typeof n === 'number' ? n : (n?.toNumber?.() ?? 0);
      }
    } finally {
      await session.close();
    }

    // PE flag from Postgres if we have an entity_id
    if (out.ultimate_parent_entity_id) {
      const client = await postgresPool.connect();
      try {
        const r = await client.query(
          'SELECT flag_private_equity FROM corporate_entities WHERE entity_id = $1',
          [out.ultimate_parent_entity_id]
        );
        if (r.rows[0]?.flag_private_equity) out.pe_backed = true;
      } finally {
        client.release();
      }
    }
  } catch {
    // Neo4j or Postgres unavailable / no data; return stub
  }

  return out;
}
