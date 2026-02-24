/**
 * Integration tests for GET /v1/providers/:npi/risk
 *
 * These tests verify the shape and error handling of the risk endpoint.
 * They gracefully skip data assertions when the provider_risk_scores table
 * is empty (i.e., the batch job has not yet run).
 *
 * Known high-volume NPIs from the spec:
 *   1316250707, 1942248901
 */

import request from 'supertest';
import { app } from '../src/index';
import { closeNeo4j } from '../src/db/neo4j';
import { closePostgres } from '../src/db/postgres';

const FAKE_NPI   = '9999999999';
const SPEC_NPI_1 = '1316250707';  // high payment volume
const SPEC_NPI_2 = '1942248901';  // high payment volume

jest.setTimeout(15_000);

afterAll(async () => {
  await Promise.all([closeNeo4j(), closePostgres()]);
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('GET /v1/providers/:npi/risk — validation', () => {
  it('returns 422 for a non-10-digit NPI', async () => {
    const res = await request(app).get('/v1/providers/123/risk');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('returns 422 for an NPI with letters', async () => {
    const res = await request(app).get('/v1/providers/123ABC7890/risk');
    expect(res.status).toBe(422);
  });

  it('returns 422 for an NPI that is too long', async () => {
    const res = await request(app).get('/v1/providers/12345678901/risk');
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// Not found
// ---------------------------------------------------------------------------

describe('GET /v1/providers/:npi/risk — not found', () => {
  it('returns 404 for a valid but non-existent NPI', async () => {
    const res = await request(app).get(`/v1/providers/${FAKE_NPI}/risk`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Response shape (when scores are present)
// ---------------------------------------------------------------------------

describe('GET /v1/providers/:npi/risk — response shape', () => {
  const assertRiskShape = (body: Record<string, unknown>): void => {
    // Envelope
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('meta');
    expect((body.meta as Record<string, unknown>).source).toBe('claidex-v1');
    expect(typeof (body.meta as Record<string, unknown>).query_time_ms).toBe('number');

    const data = body.data as Record<string, unknown>;

    // Top-level fields
    expect(typeof data.npi).toBe('string');
    expect((data.npi as string)).toHaveLength(10);
    expect(typeof data.risk_score).toBe('number');
    expect(data.risk_score as number).toBeGreaterThanOrEqual(0);
    expect(data.risk_score as number).toBeLessThanOrEqual(100);
    expect(['Low', 'Moderate', 'Elevated', 'High']).toContain(data.risk_label);

    // Components
    const components = data.components as Record<string, unknown>;
    expect(typeof components.billing_outlier_score).toBe('number');
    expect(typeof components.billing_outlier_percentile).toBe('number');
    expect(typeof components.ownership_chain_risk).toBe('number');
    expect(typeof components.payment_trajectory_score).toBe('number');
    expect(typeof components.payment_trajectory_zscore).toBe('number');
    expect(typeof components.exclusion_proximity_score).toBe('number');
    expect(typeof components.program_concentration_score).toBe('number');

    // All component scores in [0, 100]
    for (const key of [
      'billing_outlier_score',
      'billing_outlier_percentile',
      'ownership_chain_risk',
      'payment_trajectory_score',
      'exclusion_proximity_score',
      'program_concentration_score',
    ]) {
      const v = components[key] as number;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }

    // Peer group
    const peerGroup = data.peer_group as Record<string, unknown>;
    expect(peerGroup).toHaveProperty('taxonomy');
    expect(peerGroup).toHaveProperty('state');
    expect(typeof peerGroup.peer_count).toBe('number');

    // Flags
    expect(Array.isArray(data.flags)).toBe(true);
    for (const flag of data.flags as string[]) {
      expect(typeof flag).toBe('string');
      expect(flag.length).toBeGreaterThan(0);
    }

    // Meta
    const riskMeta = data.meta as Record<string, unknown>;
    expect(typeof riskMeta.computed_at).toBe('string');
    expect(Array.isArray(riskMeta.data_window_years)).toBe(true);
  };

  it.each([[SPEC_NPI_1], [SPEC_NPI_2]])(
    'returns correct shape for spec NPI %s (if computed)',
    async (npi: string) => {
      const res = await request(app).get(`/v1/providers/${npi}/risk`);

      if (res.status === 404) {
        console.warn(
          `[test] No risk score for NPI ${npi} — batch job not yet run. Skipping shape assertions.`
        );
        return;
      }

      expect(res.status).toBe(200);
      assertRiskShape(res.body as Record<string, unknown>);
      expect((res.body.data as Record<string, unknown>).npi).toBe(npi);
    }
  );

  it('returns NPI matching the requested NPI in data.npi', async () => {
    const res = await request(app).get(`/v1/providers/${SPEC_NPI_1}/risk`);
    if (res.status === 404) return;  // batch job not run

    expect(res.status).toBe(200);
    expect((res.body.data as Record<string, unknown>).npi).toBe(SPEC_NPI_1);
  });
});

// ---------------------------------------------------------------------------
// Risk label consistency
// ---------------------------------------------------------------------------

describe('GET /v1/providers/:npi/risk — label consistency', () => {
  it.each([[SPEC_NPI_1], [SPEC_NPI_2]])(
    'risk_label is consistent with risk_score for NPI %s',
    async (npi: string) => {
      const res = await request(app).get(`/v1/providers/${npi}/risk`);
      if (res.status === 404) return;

      const data = res.body.data as { risk_score: number; risk_label: string };
      const score = data.risk_score;
      const label = data.risk_label;

      if (score >= 80)       expect(label).toBe('High');
      else if (score >= 60)  expect(label).toBe('Elevated');
      else if (score >= 30)  expect(label).toBe('Moderate');
      else                   expect(label).toBe('Low');
    }
  );
});

// ---------------------------------------------------------------------------
// Peer count sanity (high-volume NPIs should have > 100 peers)
// ---------------------------------------------------------------------------

describe('GET /v1/providers/:npi/risk — peer group sanity', () => {
  it.each([[SPEC_NPI_1], [SPEC_NPI_2]])(
    'peer_count > 100 for high-volume NPI %s',
    async (npi: string) => {
      const res = await request(app).get(`/v1/providers/${npi}/risk`);
      if (res.status === 404) return;

      const peerGroup = (res.body.data as Record<string, unknown>).peer_group as {
        peer_count: number;
      };
      expect(peerGroup.peer_count).toBeGreaterThan(100);
    }
  );
});
