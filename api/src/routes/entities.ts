import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { runCypher } from '../db/neo4j';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import {
  ApiResponse,
  EntityDetail,
  Person,
  toStr,
  toBool,
} from '../types/api';

export const entitiesRouter = Router();

const entityParamSchema = z.object({
  entityId: z.string().min(1, 'entityId is required'),
});

entitiesRouter.get(
  '/:entityId',
  validate(entityParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const start = Date.now();
    const { entityId } = req.params as z.infer<typeof entityParamSchema>;

    try {
      const records = await runCypher(
        `
        MATCH (e:CorporateEntity {entity_id: $entityId})
        OPTIONAL MATCH (e)-[:OWNS]->(child:CorporateEntity)
        OPTIONAL MATCH (e)-[:CONTROLLED_BY]->(pe:Person)
        RETURN
          e,
          collect(DISTINCT child) AS owned,
          collect(DISTINCT pe)    AS officers
        `,
        { entityId }
      );

      if (records.length === 0 || !records[0]?.e) {
        return next(AppError.notFound('CorporateEntity', entityId));
      }

      const row = records[0] as {
        e: { properties: Record<string, unknown> };
        owned: Array<{ properties: Record<string, unknown> } | null>;
        officers: Array<{ properties: Record<string, unknown> } | null>;
      };

      const e = row.e.properties;

      const ownedEntities = (row.owned ?? [])
        .filter(Boolean)
        .map((child) => {
          const cp = child!.properties;
          return {
            entity_id:  toStr(cp['entity_id']) ?? '',
            name:       toStr(cp['name']),
            entityType: toStr(cp['entityType']),
          };
        });

      const officers: Person[] = (row.officers ?? [])
        .filter(Boolean)
        .map((pe) => {
          const pp = pe!.properties;
          return {
            associate_id: toStr(pp['associate_id']) ?? '',
            lastName:     toStr(pp['lastName']),
            firstName:    toStr(pp['firstName']),
            middleName:   toStr(pp['middleName']),
            title:        toStr(pp['title']),
            city:         toStr(pp['city']),
            state:        toStr(pp['state']),
          };
        });

      const entity: EntityDetail = {
        entity_id:        toStr(e['entity_id']) ?? entityId,
        name:             toStr(e['name']),
        dba:              toStr(e['dba']),
        city:             toStr(e['city']),
        state:            toStr(e['state']),
        zip:              toStr(e['zip']),
        entityType:       toStr(e['entityType']),
        isCorporation:    toBool(e['isCorporation']),
        isLLC:            toBool(e['isLLC']),
        isHoldingCompany: toBool(e['isHoldingCompany']),
        isInvestmentFirm: toBool(e['isInvestmentFirm']),
        isPrivateEquity:  toBool(e['isPrivateEquity']),
        isForProfit:      toBool(e['isForProfit']),
        isNonProfit:      toBool(e['isNonProfit']),
        owned_entities:   ownedEntities,
        officers,
      };

      const body: ApiResponse<EntityDetail> = {
        data: entity,
        meta: { source: 'claidex-v1', query_time_ms: Date.now() - start },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  }
);
