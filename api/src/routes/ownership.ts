import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { runCypher } from '../db/neo4j';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import {
  ApiResponse,
  OwnershipLevel,
  toNumber,
  toStr,
} from '../types/api';

export const ownershipRouter = Router();

const npiSchema = z.object({
  npi: z.string().regex(/^\d{10}$/, 'NPI must be exactly 10 digits'),
});

/**
 * GET /v1/ownership/:npi
 *
 * The graph has no direct Provider→CorporateEntity edge. We resolve ownership by:
 * 1. Fetching the provider's name by NPI.
 * 2. Finding CorporateEntity nodes whose name matches (case-insensitive CONTAINS).
 * 3. Traversing OWNS edges up to 5 levels from those entities.
 *
 * The endpoint returns an array of ownership levels sorted by depth.
 */
ownershipRouter.get(
  '/:npi',
  validate(npiSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const start = Date.now();
    const { npi } = req.params as z.infer<typeof npiSchema>;

    try {
      // Step 1: confirm the provider exists and grab their name
      const providerRows = await runCypher<{ name: unknown }>(
        `MATCH (p:Provider {npi: $npi}) RETURN p.name AS name`,
        { npi }
      );

      if (providerRows.length === 0) {
        return next(AppError.notFound('Provider', npi));
      }

      const providerName = toStr(providerRows[0]?.name) ?? '';

      // Step 2: traverse ownership chains starting from matching CorporateEntity nodes
      // (SNF stub entities derived from SNF ownership data are keyed by CMS associate ID)
      const ownershipRows = await runCypher(
        `
        MATCH (snf:CorporateEntity)
        WHERE snf.entityType = 'SNF'
          AND toLower(snf.name) CONTAINS toLower($name)
        OPTIONAL MATCH path = (snf)<-[:OWNS*1..5]-(owner:CorporateEntity)
        WITH snf, path, owner,
             CASE WHEN path IS NULL THEN 0 ELSE length(path) END AS depth,
             CASE WHEN path IS NULL THEN null ELSE last(relationships(path)) END AS edge
        RETURN
          snf.entity_id        AS snf_entity_id,
          snf.name             AS snf_name,
          owner.entity_id      AS owner_entity_id,
          owner.name           AS owner_name,
          owner.entityType     AS owner_entity_type,
          edge.ownershipPct    AS ownership_pct,
          edge.roleCode        AS role_code,
          edge.roleText        AS role_text,
          depth
        ORDER BY depth ASC
        LIMIT 50
        `,
        { name: providerName }
      );

      const levels: OwnershipLevel[] = [];

      // Always include the SNF entity itself as depth=0 if found
      const snfIds = new Set<string>();
      for (const row of ownershipRows as Record<string, unknown>[]) {
        const snfId = toStr(row['snf_entity_id']);
        if (snfId && !snfIds.has(snfId)) {
          snfIds.add(snfId);
          levels.push({
            entity_id:    snfId,
            name:         toStr(row['snf_name']),
            entityType:   'SNF',
            ownershipPct: null,
            roleCode:     null,
            roleText:     null,
            depth:        0,
          });
        }

        const ownerId = toStr(row['owner_entity_id']);
        const depth   = toNumber(row['depth']) ?? 1;
        if (ownerId) {
          levels.push({
            entity_id:    ownerId,
            name:         toStr(row['owner_name']),
            entityType:   toStr(row['owner_entity_type']),
            ownershipPct: toNumber(row['ownership_pct']),
            roleCode:     toStr(row['role_code']),
            roleText:     toStr(row['role_text']),
            depth,
          });
        }
      }

      // Deduplicate by entity_id keeping the first occurrence (lowest depth)
      const seen = new Set<string>();
      const deduped = levels.filter((l) => {
        if (seen.has(l.entity_id)) return false;
        seen.add(l.entity_id);
        return true;
      });

      const body: ApiResponse<OwnershipLevel[]> = {
        data: deduped,
        meta: { source: 'claidex-v1', query_time_ms: Date.now() - start },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  }
);

/** React Flow graph shape */
export interface OwnershipGraph {
  nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string }>;
}

/**
 * GET /v1/ownership/:npi/graph
 *
 * Returns ownership as { nodes, edges } for React Flow.
 * If Neo4j has no data for this NPI, returns empty nodes/edges (200).
 */
ownershipRouter.get(
  '/:npi/graph',
  validate(npiSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const start = Date.now();
    const { npi } = req.params as z.infer<typeof npiSchema>;

    try {
      const nodeIds = new Set<string>();
      const nodes: OwnershipGraph['nodes'] = [];
      const edges: OwnershipGraph['edges'] = [];

      type Row = {
        p?: { properties?: Record<string, unknown> };
        r?: { type?: string };
        related?: { labels?: string[]; properties?: Record<string, unknown> };
      };

      const graphRows = await runCypher<Row>(
        `MATCH (p:Provider {npi: $npi})
         OPTIONAL MATCH (p)-[r:OWNS|CONTROLLED_BY]-(related)
         WHERE type(r) IN ['OWNS', 'CONTROLLED_BY']
         RETURN p, r, related
         LIMIT 50`,
        { npi }
      );

      const providerNodeId = `provider-${npi}`;
      if (!nodeIds.has(providerNodeId)) {
        nodeIds.add(providerNodeId);
        nodes.push({
          id: providerNodeId,
          type: 'Provider',
          data: { label: `Provider ${npi}`, npi },
        });
      }

      for (const row of graphRows) {
        const p = row.p;
        const related = row.related;
        const r = row.r;
        const pProps = p?.properties ?? {};
        const relProps = related?.properties ?? {};
        const relLabels: string[] = (related as { labels?: string[] })?.labels ?? [];

        if (p?.properties) {
          const id = `provider-${toStr(pProps['npi']) ?? npi}`;
          if (!nodeIds.has(id)) {
            nodeIds.add(id);
            nodes.push({
              id,
              type: 'Provider',
              data: {
                label: toStr(pProps['name']) ?? toStr(pProps['display_name']) ?? npi,
                npi: toStr(pProps['npi']),
              },
            });
          }
        }

        if (relProps && Object.keys(relProps).length > 0 && r) {
          const relType = relLabels.includes('CorporateEntity') ? 'CorporateEntity' : relLabels.includes('Person') ? 'Person' : 'Node';
          const relId = toStr(relProps['entity_id']) ?? toStr(relProps['associate_id']) ?? toStr(relProps['npi']) ?? `n-${nodeIds.size}`;
          const targetId = `${relType}-${relId}`;
          if (!nodeIds.has(targetId)) {
            nodeIds.add(targetId);
            nodes.push({
              id: targetId,
              type: relType,
              data: {
                label: toStr(relProps['name']) ?? toStr(relProps['display_name']) ?? relId,
                ...relProps,
              },
            });
          }
          const edgeId = `e-${providerNodeId}-${targetId}-${r.type ?? 'OWNS'}`;
          if (!edges.some((e) => e.id === edgeId)) {
            edges.push({ id: edgeId, source: providerNodeId, target: targetId });
          }
        }
      }

      res.json({
        data: { nodes, edges },
        meta: { source: 'claidex-v1', query_time_ms: Date.now() - start },
      });
    } catch (err) {
      next(err);
    }
  }
);
