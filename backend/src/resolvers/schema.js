export const typeDefs = `#graphql
  type Provider {
    npi: String!
    fullName: String
    type: String
    address: String
  }

  type Entity {
    id: ID!
    name: String
    type: String
    jurisdiction: String
  }

  type Exclusion {
    id: ID!
    name: String
    npi: String
    excludedAt: String
    reason: String
  }

  type Query {
    provider(npi: String!): Provider
    entity(id: ID!): Entity
    exclusions(search: String, page: Int, limit: Int): ExclusionList
    ownershipGraph(npi: String, entityId: ID, depth: Int): OwnershipGraph
  }

  type ExclusionList {
    items: [Exclusion!]!
    total: Int!
    page: Int!
    limit: Int!
  }

  type OwnershipGraph {
    nodes: [OwnershipNode!]!
    edges: [OwnershipEdge!]!
  }

  type OwnershipNode {
    id: String!
    label: String
    type: String
  }

  type OwnershipEdge {
    from: String!
    to: String!
    relation: String
  }
`;
