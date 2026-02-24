import { postgresPool } from '../db/postgres.js';

/**
 * Get ownership change timeline for an entity.
 * - If entityId is a facility (SNF): events where facility_entity_id or facility_ccn matches.
 * - If entityId is an owner: events where from_owner_entity_id or to_owner_entity_id matches.
 * Prefers facility view when both apply.
 */
export async function getEntityTimeline(entityId) {
  if (!entityId) return null;

  const client = await postgresPool.connect();
  try {
    // Check for facility-scoped events first
    const facilityRows = await client.query(
      `SELECT facility_entity_id, facility_ccn, facility_name, state, effective_date,
              from_owner_entity_id, from_owner_name, to_owner_entity_id, to_owner_name,
              event_type, source_file
       FROM chow_events
       WHERE facility_entity_id = $1 OR facility_ccn = $1
       ORDER BY effective_date ASC NULLS LAST`,
      [String(entityId).trim()]
    );

    if (facilityRows.rows.length > 0) {
      return {
        entity_id: entityId,
        timeline_type: 'facility',
        events: facilityRows.rows.map(row => formatEvent(row)),
        meta: {
          source: 'SNF CHOW',
          event_count: facilityRows.rows.length,
        },
      };
    }

    // Owner-scoped events
    const ownerRows = await client.query(
      `SELECT facility_entity_id, facility_ccn, facility_name, state, effective_date,
              from_owner_entity_id, from_owner_name, to_owner_entity_id, to_owner_name,
              event_type, source_file
       FROM chow_events
       WHERE from_owner_entity_id = $1 OR to_owner_entity_id = $1
       ORDER BY effective_date ASC NULLS LAST`,
      [String(entityId).trim()]
    );

    if (ownerRows.rows.length > 0) {
      return {
        entity_id: entityId,
        timeline_type: 'owner',
        events: ownerRows.rows.map(row => formatEvent(row)),
        meta: {
          source: 'SNF CHOW',
          event_count: ownerRows.rows.length,
        },
      };
    }

    return {
      entity_id: entityId,
      timeline_type: null,
      events: [],
      meta: { source: 'SNF CHOW', event_count: 0 },
    };
  } finally {
    client.release();
  }
}

function formatEvent(row) {
  const date = row.effective_date
    ? (row.effective_date instanceof Date
        ? row.effective_date.toISOString().slice(0, 10)
        : String(row.effective_date).slice(0, 10))
    : null;
  return {
    date,
    event_type: row.event_type || 'ownership_change',
    facility_name: row.facility_name ?? null,
    state: row.state ?? null,
    from_owner: {
      entity_id: row.from_owner_entity_id ?? null,
      name: row.from_owner_name ?? null,
    },
    to_owner: {
      entity_id: row.to_owner_entity_id ?? null,
      name: row.to_owner_name ?? null,
    },
  };
}
