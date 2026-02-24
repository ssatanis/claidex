# Claidex Risk Score — Modal Parallel Compute Setup

This guide walks through setting up and running the Modal-based parallel risk score computation pipeline.

## Prerequisites

- Python 3.11+
- Modal account (sign up at https://modal.com)
- Neo4j instance (accessible from Modal containers)
- Postgres instance (for results storage)

## One-Time Setup

### 1. Install Modal

```bash
pip install modal
```

### 2. Authenticate with Modal

```bash
modal setup
```

This will open a browser window to authenticate. Follow the prompts.

### 3. Create Neo4j Secret

Store your Neo4j credentials in Modal's secret management:

```bash
modal secret create claidex-neo4j \
    NEO4J_URI=bolt://your-neo4j-host:7687 \
    NEO4J_USER=neo4j \
    NEO4J_PASSWORD=your-password
```

Replace with your actual Neo4j connection details. For production, ensure your Neo4j instance:
- Is accessible from the internet (Modal containers run in the cloud)
- Can handle ~300 concurrent connections (set `dbms.connector.bolt.thread_pool_max_size=500`)
- Has sufficient memory for your graph size

### 4. Prepare Input Data

The pipeline requires three input parquet files on the Modal volume:

1. **providers.parquet** — Provider registry
   - Required columns: `npi`, `taxonomy_1`, `state`, `is_excluded`, `display_name`

2. **payments_combined.parquet** — Payment data
   - Required columns: `npi`, `year`, `program`, `payments`, `claims`, `beneficiaries`, `taxonomy`, `state`
   - This should match the schema of `payments_combined_v` view

3. **exclusions.parquet** — Exclusion records
   - Required columns: `npi`, `excldate`, `reinstated`

#### Option A: Export from Postgres (Recommended)

Run the data export script:

```bash
python etl/compute/prepare_modal_data.py
```

This will:
- Query your local Postgres `payments_combined_v` view
- Export providers, exclusions, and payments to parquet
- Save to `data/modal_input/` directory

#### Option B: Manual Export

If you already have parquet files, ensure they match the schema above.

### 5. Upload Data to Modal Volume

```bash
# Create volume (if it doesn't exist)
modal volume create claidex-data

# Upload files
modal volume put claidex-data ./data/modal_input/providers.parquet /data/providers.parquet
modal volume put claidex-data ./data/modal_input/payments_combined.parquet /data/payments_combined.parquet
modal volume put claidex-data ./data/modal_input/exclusions.parquet /data/exclusions.parquet
```

**Note:** For large files (>1GB), the upload may take several minutes. Modal will show progress.

## Running the Pipeline

### Basic Run

```bash
modal run etl/compute/claidex_modal.py \
    --postgres-url "postgresql://user:pass@host:port/db" \
    --batch-size 1000 \
    --upsert-to-db
```

### Parameters

- `--postgres-url` — Postgres connection string for upserting results (required if `--upsert-to-db`)
- `--batch-size` — NPIs per batch (default: 1000). Tune based on Neo4j performance:
  - 500 — if Neo4j times out on large UNWIND batches
  - 1000 — default, good for most setups
  - 2000 — if your Neo4j is very fast and you want fewer total batches
- `--upsert-to-db` — Set to upsert results to Postgres table `provider_risk_scores` (default: True)
- `--providers-file` — Path to providers parquet in volume (default: `/data/providers.parquet`)

### Run in Background (Detached)

For long-running jobs, use `--detach` to run in the background:

```bash
modal run --detach etl/compute/claidex_modal.py \
    --postgres-url "postgresql://..." \
    --batch-size 1000
```

Monitor progress at: https://modal.com/apps

### Environment Variables

Instead of passing `--postgres-url`, you can set:

```bash
export POSTGRES_URL="postgresql://..."
# or
export NEON_PROVIDERS_URL="postgresql://..."
```

The script will automatically use these if no `--postgres-url` is provided.

## Monitoring

### View Logs

- **Real-time:** Watch logs at https://modal.com/apps while the job runs
- **Per-container:** Click on individual function invocations to see detailed logs

### Check Progress

The main entrypoint shows progress as batches complete:

```
→ 347/1789 batches complete
```

### Expected Timeline

For 1.78M NPIs:
- **Batch size 1000** → ~1,789 batches
- **Concurrency 300** → ~6 batches per worker
- **Neo4j query time** → ~0.5-2 seconds per batch
- **Total wall time** → ~5-15 minutes

Actual time depends on:
- Neo4j performance (graph size, hardware, network latency)
- Payment data volume per batch
- Modal cold start time (first run is slower)

## Downloading Results

### Option 1: From Modal Volume

```bash
modal volume get claidex-data /data/claidex_results_final.parquet ./results/final.parquet
```

### Option 2: From Postgres

If `--upsert-to-db` was enabled, results are in the `provider_risk_scores` table:

```sql
SELECT * FROM provider_risk_scores LIMIT 10;
```

## Troubleshooting

### Neo4j Connection Timeout

**Symptom:** Batches fail with `ServiceUnavailable` or timeout errors

**Solutions:**
1. Ensure Neo4j is publicly accessible (not behind firewall)
2. Increase timeout: Edit `claidex_modal.py` line 92: `timeout=1800` (30 min)
3. Reduce batch size: Use `--batch-size 500`
4. Check Neo4j connection pool settings

### Out of Memory (OOM)

**Symptom:** Batches fail with `MemoryError` or container restarts

**Solutions:**
1. Increase container memory: Edit `claidex_modal.py` line 94: `memory=8192` (8GB)
2. Reduce batch size to process fewer NPIs per container
3. For merge step, increase memory at line 256: `memory=65536` (64GB)

### No NPIs Found

**Symptom:** `[Batch N] No payment data — skipping`

**Causes:**
- Input data not uploaded to volume correctly
- NPI filter mismatch (providers have NPIs not in payments data)

**Solution:**
- Verify volume contents: `modal volume ls claidex-data /data/`
- Check parquet files locally before upload
- Re-run data export script: `python etl/compute/prepare_modal_data.py`

### Slow Neo4j Queries

**Symptom:** Batches take >10 seconds each

**Solutions:**
1. Ensure Neo4j has proper indexes on `CorporateEntity.name`, `Provider.name`
2. Add Cypher index: `CREATE INDEX FOR (ce:CorporateEntity) ON (ce.name)`
3. Check Neo4j query plan: `EXPLAIN ...` the UNWIND query
4. Consider pre-warming Neo4j caches (run a few test queries first)

### Upload Fails for Large Files

**Symptom:** `modal volume put` times out or fails

**Solutions:**
1. Split large files into chunks:
   ```bash
   # Split payments into yearly chunks
   python -c "import polars as pl; df = pl.read_parquet('payments.parquet');
   for year in df['year'].unique():
       df.filter(pl.col('year')==year).write_parquet(f'payments_{year}.parquet')"
   ```
2. Use compression: Parquet files are already compressed, but ensure no double-compression
3. Upload during off-peak hours

## Cost Estimation

Modal pricing (as of 2024):
- **CPU:** $0.000030 per CPU-second
- **Memory:** $0.000004 per GB-second
- **Disk I/O:** Included in compute costs

Example: 1.78M NPIs, 1789 batches, 4GB RAM, 300 concurrent containers
- Per-batch time: ~10 seconds
- Total container-seconds: 1789 batches × 10 sec = 17,890 container-seconds
- Total CPU-seconds: 17,890 × 4 vCPUs = 71,560 CPU-seconds
- Total GB-seconds: 17,890 × 4 GB = 71,560 GB-seconds

**Estimated cost:**
- CPU: 71,560 × $0.000030 = $2.15
- Memory: 71,560 × $0.000004 = $0.29
- **Total: ~$2.44 per run**

This is ~500× cheaper than running equivalent EC2 instances for 25-100 hours.

## Comparison: Before vs. After

| Metric | Before (Local) | After (Modal) |
|--------|----------------|---------------|
| Execution | Serial (1 thread) | Parallel (300 containers) |
| Neo4j queries | 1,788,105 queries | ~1,789 queries |
| Query pattern | 1 NPI per query | 1000 NPIs per UNWIND batch |
| Wall time | 25-100 hours | 5-15 minutes |
| Cost | $10-40 (EC2 spot) | ~$2.50 (Modal) |
| Scalability | Limited by RAM | Scales to millions of NPIs |

## Advanced: Incremental Updates

To compute risk scores for only new/updated providers:

1. **Track last run timestamp:**
   ```sql
   SELECT MAX(updated_at) FROM provider_risk_scores;
   ```

2. **Filter providers:**
   ```python
   # In prepare_modal_data.py, add WHERE clause:
   WHERE p.updated_at > '2024-01-01'::timestamptz
   ```

3. **Upload delta only:**
   ```bash
   modal volume put claidex-data ./data/modal_input/providers_delta.parquet /data/providers.parquet
   ```

4. **Run with smaller batch size** (fewer NPIs = faster):
   ```bash
   modal run etl/compute/claidex_modal.py --batch-size 500
   ```

## Maintenance

### Clean Up Old Chunks

After successful runs, clean up intermediate output chunks to save volume space:

```bash
modal volume ls claidex-data /data/output_chunks/
modal volume rm claidex-data /data/output_chunks/*
```

### Update Dependencies

If you update `risk_scores.py` logic:

1. Make changes to `etl/compute/risk_scores.py` (the local version)
2. Re-deploy: `modal run etl/compute/claidex_modal.py` (Modal will re-build the image with updated code)

### Monitor Volume Usage

```bash
modal volume ls claidex-data /data/
```

Modal includes 10GB free storage per workspace. Larger volumes incur storage costs.

## Support

For issues specific to:
- **Modal platform:** https://modal.com/docs or Slack support
- **Claidex pipeline logic:** Check `etl/compute/risk_scores.py` docstrings
- **Neo4j queries:** Review Cypher query in `claidex_modal.py` line 158-213

## Next Steps

After successful run:
1. Validate results: Compare a few NPIs against the local `risk_scores.py` output
2. Set up scheduled runs: Use Modal's cron triggers for daily/weekly batch jobs
3. Optimize batch size: Experiment with different values to find optimal throughput
4. Scale up: Increase `concurrency_limit` to 500+ for even faster runs (requires Neo4j tuning)
