import neo4j, { Driver, Session, Integer } from 'neo4j-driver';
import { config } from '../config';

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      config.neo4j.uri,
      neo4j.auth.basic(config.neo4j.user, config.neo4j.password),
      {
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 5000,
        logging: neo4j.logging.console(config.isDev ? 'warn' : 'error'),
      }
    );
  }
  return driver;
}

export function getNeo4jSession(): Session {
  return getDriver().session();
}

export async function verifyNeo4jConnectivity(): Promise<boolean> {
  try {
    await getDriver().verifyConnectivity();
    return true;
  } catch {
    return false;
  }
}

export async function closeNeo4j(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/**
 * Convert a JS number to a Neo4j Integer.
 * Neo4j requires LIMIT / SKIP parameters to be integers, not floats.
 */
export function neo4jInt(n: number): Integer {
  return neo4j.int(n);
}

/** Run a Cypher query and return all records, auto-closing the session. */
export async function runCypher<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  if (config.isDev) {
    const q = cypher.trim().replace(/\s+/g, ' ');
    console.debug('[neo4j] Cypher:', q.slice(0, 200) + (q.length > 200 ? '…' : ''));
  }
  const session = getNeo4jSession();
  try {
    const result = await session.run(cypher, params);
    const records = result.records.map((r) => r.toObject() as T);
    if (config.isDev && result.summary) {
      const c = result.summary.counters;
      console.debug('[neo4j] Result:', { records: result.records.length, ...c });
    }
    return records;
  } finally {
    await session.close();
  }
}
