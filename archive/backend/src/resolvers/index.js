import { getProviderByNpi } from '../services/providerService.js';
import { getEntityById } from '../services/entityService.js';
import { getExclusions } from '../services/exclusionService.js';
import { getOwnershipGraph } from '../services/ownershipService.js';

export const resolvers = {
  Query: {
    async provider(_, { npi }) {
      const row = await getProviderByNpi(npi);
      if (!row) return null;
      return {
        npi: row.npi,
        fullName: row.full_name,
        type: row.type,
        address: row.address,
      };
    },
    async entity(_, { id }) {
      const row = await getEntityById(id);
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        jurisdiction: row.jurisdiction,
      };
    },
    async exclusions(_, { search, page = 1, limit = 50 }) {
      const result = await getExclusions({ search, page, limit });
      return {
        items: result.items.map((r) => ({
          id: r.id,
          name: r.name,
          npi: r.npi,
          excludedAt: r.excluded_at,
          reason: r.reason,
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    },
    async ownershipGraph(_, { npi, entityId, depth = 2 }) {
      return getOwnershipGraph({ npi, entityId, depth });
    },
  },
};
