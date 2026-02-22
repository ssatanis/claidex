import neo4j from 'neo4j-driver';

const uri = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
const user = process.env.NEO4J_USER ?? 'neo4j';
const password = process.env.NEO4J_PASSWORD ?? '';

export const neo4jDriver = neo4j.driver(uri, neo4j.auth.basic(user, password));

export async function getNeo4jSession() {
  return neo4jDriver.session();
}
