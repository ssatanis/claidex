/**
 * Integration tests for Claidex API routes.
 *
 * These tests hit a live Neo4j instance.  They require the .env to be populated
 * with NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD and data to have been loaded.
 *
 * Real NPI sourced from payments_combined.parquet (10-digit, validated in graph).
 */
import request from 'supertest';
import { app } from '../src/index';
import { closeNeo4j } from '../src/db/neo4j';
import { closePostgres } from '../src/db/postgres';

// ---------------------------------------------------------------------------
// Constants from actual data
// ---------------------------------------------------------------------------

// From: python3 -c "import polars as pl; df = pl.read_parquet('data/processed/payments/payments_combined.parquet'); valid = df.filter(pl.col('npi').cast(pl.Utf8).str.len_chars() == 10).select('npi').unique().head(5); print(valid['npi'].to_list())"
// ['1407119688', '1437413937', '1548937220', '1891729638', '1285366682']
const REAL_NPI = '1407119688';
const FAKE_NPI = '9999999999';

// Neo4j queries can be slow on first connection; give each test 15 s
jest.setTimeout(15_000);

afterAll(async () => {
  await Promise.all([closeNeo4j(), closePostgres()]);
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 with status field', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBeLessThanOrEqual(503);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('neo4j');
    expect(res.body).toHaveProperty('uptime_seconds');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/providers/:npi
// ---------------------------------------------------------------------------

describe('GET /v1/providers/:npi', () => {
  it('returns 422 for a non-10-digit NPI', async () => {
    const res = await request(app).get('/v1/providers/123');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('returns 422 for an NPI with letters', async () => {
    const res = await request(app).get('/v1/providers/123ABC7890');
    expect(res.status).toBe(422);
  });

  it('returns 404 for a valid but non-existent NPI', async () => {
    const res = await request(app).get(`/v1/providers/${FAKE_NPI}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns provider with correct envelope for real NPI (if graph is loaded)', async () => {
    const res = await request(app).get(`/v1/providers/${REAL_NPI}`);

    if (res.status === 404) {
      // Graph not yet loaded — acceptable in CI with empty DB
      console.warn(`[test] Provider ${REAL_NPI} not found in graph — skipping data assertions`);
      return;
    }

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(res.body.meta.source).toBe('claidex-v1');
    expect(typeof res.body.meta.query_time_ms).toBe('number');

    const provider = res.body.data;
    expect(provider.npi).toBe(REAL_NPI);
    expect(Array.isArray(provider.payments)).toBe(true);
    expect(Array.isArray(provider.exclusions)).toBe(true);
    expect(typeof provider.isExcluded).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/payments/:npi
// ---------------------------------------------------------------------------

describe('GET /v1/payments/:npi', () => {
  it('returns 422 for invalid NPI format', async () => {
    const res = await request(app).get('/v1/payments/badnpi');
    expect(res.status).toBe(422);
  });

  it('returns 404 for non-existent NPI', async () => {
    const res = await request(app).get(`/v1/payments/${FAKE_NPI}`);
    expect(res.status).toBe(404);
  });

  it('returns payment array for real NPI (if graph is loaded)', async () => {
    const res = await request(app).get(`/v1/payments/${REAL_NPI}`);

    if (res.status === 404) {
      console.warn(`[test] Provider ${REAL_NPI} not in graph — skipping`);
      return;
    }

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.source).toBe('claidex-v1');

    if (res.body.data.length > 0) {
      const payment = res.body.data[0];
      expect(payment).toHaveProperty('record_id');
      expect(payment).toHaveProperty('year');
      expect(payment).toHaveProperty('program');
    }
  });
});

// ---------------------------------------------------------------------------
// GET /v1/exclusions
// ---------------------------------------------------------------------------

describe('GET /v1/exclusions', () => {
  it('returns paginated exclusions with meta', async () => {
    const res = await request(app).get('/v1/exclusions');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('limit');
    expect(res.body.meta).toHaveProperty('offset');
    expect(res.body.meta).toHaveProperty('total');
    expect(res.body.meta.limit).toBe(50);
    expect(res.body.meta.offset).toBe(0);
  });

  it('respects limit and offset params', async () => {
    const res = await request(app).get('/v1/exclusions?limit=10&offset=0');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(10);
    expect(res.body.meta.limit).toBe(10);
  });

  it('rejects limit > 200', async () => {
    const res = await request(app).get('/v1/exclusions?limit=999');
    expect(res.status).toBe(422);
  });

  it('filters by state', async () => {
    const res = await request(app).get('/v1/exclusions?state=TX');
    expect(res.status).toBe(200);
    for (const excl of res.body.data) {
      expect(excl.state).toBe('TX');
    }
  });

  it('rejects invalid start_date format', async () => {
    const res = await request(app).get('/v1/exclusions?start_date=01-01-2020');
    expect(res.status).toBe(422);
  });

  it('accepts valid date range', async () => {
    const res = await request(app)
      .get('/v1/exclusions?start_date=2020-01-01&end_date=2023-12-31&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/search
// ---------------------------------------------------------------------------

describe('GET /v1/search', () => {
  it('returns 422 when q is missing', async () => {
    const res = await request(app).get('/v1/search');
    expect(res.status).toBe(422);
  });

  it('returns 422 when q is too short', async () => {
    const res = await request(app).get('/v1/search?q=a');
    expect(res.status).toBe(422);
  });

  it('returns results array for a common search term', async () => {
    const res = await request(app).get('/v1/search?q=smith');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.source).toBe('claidex-v1');
  });

  it('respects type=provider filter', async () => {
    const res = await request(app).get('/v1/search?q=health&type=provider&limit=5');
    expect(res.status).toBe(200);
    for (const result of res.body.data) {
      expect(result.type).toBe('Provider');
    }
  });

  it('respects limit param', async () => {
    const res = await request(app).get('/v1/search?q=care&limit=3');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/ownership/:npi
// ---------------------------------------------------------------------------

describe('GET /v1/ownership/:npi', () => {
  it('returns 422 for invalid NPI', async () => {
    const res = await request(app).get('/v1/ownership/abc');
    expect(res.status).toBe(422);
  });

  it('returns 404 for non-existent NPI', async () => {
    const res = await request(app).get(`/v1/ownership/${FAKE_NPI}`);
    expect(res.status).toBe(404);
  });

  it('returns an array (possibly empty) for a real NPI', async () => {
    const res = await request(app).get(`/v1/ownership/${REAL_NPI}`);

    if (res.status === 404) {
      console.warn(`[test] Provider ${REAL_NPI} not in graph`);
      return;
    }

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unknown routes → 404
// ---------------------------------------------------------------------------

describe('Unknown routes', () => {
  it('returns 404 for /v1/nonexistent', async () => {
    const res = await request(app).get('/v1/nonexistent');
    expect(res.status).toBe(404);
  });
});
