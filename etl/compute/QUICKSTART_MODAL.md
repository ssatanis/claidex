# Claidex Risk Score — Modal Quickstart

Run the full 1.78M NPI risk score pipeline in ~5-15 minutes using Modal's parallel infrastructure.

## Quick Setup (5 minutes)

```bash
# 1. Install Modal
pip install modal

# 2. Authenticate
modal setup

# 3. Create Neo4j secret
modal secret create claidex-neo4j \
    NEO4J_URI=bolt://your-host:7687 \
    NEO4J_USER=neo4j \
    NEO4J_PASSWORD=your-password

# 4. Export data from Postgres
python etl/compute/prepare_modal_data.py

# 5. Upload to Modal volume
modal volume create claidex-data
modal volume put claidex-data ./data/modal_input/providers.parquet /data/providers.parquet
modal volume put claidex-data ./data/modal_input/payments_combined.parquet /data/payments_combined.parquet
modal volume put claidex-data ./data/modal_input/exclusions.parquet /data/exclusions.parquet

# 6. Run the pipeline
modal run etl/compute/claidex_modal.py \
    --postgres-url "postgresql://user:pass@host:port/db"

# 7. Download results (optional, already in Postgres)
modal volume get claidex-data /data/claidex_results_final.parquet ./results/final.parquet
```

## What Changed vs. Local risk_scores.py

| Aspect | Before (Local) | After (Modal) |
|--------|----------------|---------------|
| **Neo4j queries** | 1,788,105 serial queries (1 per NPI) | ~1,789 batched queries (1000 NPIs per UNWIND) |
| **Parallelism** | Single-threaded | 300 concurrent containers |
| **Wall time** | 25-100 hours | 5-15 minutes |
| **Cost** | $10-40 (EC2 spot) | ~$2.50 (Modal) |
| **Scalability** | Limited by local RAM | Scales to millions |

## File Structure

```
etl/compute/
├── risk_scores.py              # Original (still works locally!)
├── claidex_modal.py            # New: Modal parallel version
├── prepare_modal_data.py       # New: Export data to parquet
├── MODAL_SETUP.md              # New: Detailed setup guide
└── QUICKSTART_MODAL.md         # This file
```

## Key Architecture Changes

### Before: Serial Neo4j Loop
```python
for npi in all_npis:  # 1,788,105 iterations
    chain_data = query_neo4j_ownership(driver, npi, name)  # 1 query
    # ... process result
```

**Problem:** 1.78M serial round-trips × 50-200ms = 25-100 hours

### After: Batched UNWIND + Parallel Execution
```python
# Split NPIs into batches of 1000
batches = chunk_npis(all_npis, batch_size=1000)  # → 1,789 batches

# Process ALL batches in parallel across 300 containers
process_npi_batch.starmap(batches)  # Each does 1 UNWIND query for 1000 NPIs
```

**Result:** ~1,789 queries ÷ 300 parallel workers = ~6 queries per worker @ 0.5-2 sec = ~5-15 min total

### Batched Neo4j UNWIND Query
```cypher
UNWIND $batch AS item  -- batch = [{npi: "123...", name: "Hospital"}, ...]
WITH item.npi AS npi, item.name AS provider_name

// Find SNF entity for this NPI
OPTIONAL MATCH (snf:CorporateEntity)
WHERE snf.entityType = 'SNF'
  AND toLower(snf.name) CONTAINS toLower(provider_name)
WITH npi, HEAD(COLLECT(snf)) AS snf

// Traverse ownership chain
OPTIONAL MATCH path = (snf)<-[:OWNS*1..5]-(ancestor:CorporateEntity)
WITH npi, [snf] + COLLECT(DISTINCT ancestor) AS chain_entities

// ... rest of query

RETURN npi, chain_provider_count, chain_excluded_count, owner_excluded_count
```

**Key insight:** Process 1000 NPIs in ONE query instead of 1000 separate queries.

## Preserved Logic

✅ **All existing metric computations are IDENTICAL:**
- Billing outlier scores (peer-group robust z-scores)
- Payment trajectory scores (YoY growth analysis)
- Program concentration scores
- Exclusion proximity scores
- Ownership chain risk scores

✅ **Same database schema:** Results go to `provider_risk_scores` table

✅ **Same outputs:** risk_score, risk_label, all component scores, flags, etc.

✅ **Existing CLI still works:** `python -m etl.compute.risk_scores` runs locally unchanged

## When to Use Which Version

### Use Local risk_scores.py when:
- Testing on small NPI samples (`--npi 1234567890`)
- Debugging logic changes
- Running on-premise where Modal isn't available
- Working with <100K NPIs (finishes in reasonable time)

### Use Modal claidex_modal.py when:
- Processing full 1.78M NPI dataset
- Running production batch jobs (daily/weekly updates)
- Need results fast (5-15 min vs. days)
- Cost matters ($2.50 vs. $40)

## Tuning Parameters

### Batch Size (`--batch-size`)
```bash
# Small batches (more granular parallelism, higher overhead)
modal run ... --batch-size 500

# Default (balanced)
modal run ... --batch-size 1000

# Large batches (fewer total batches, may timeout on slow Neo4j)
modal run ... --batch-size 2000
```

**Rule of thumb:** Start with 1000. If Neo4j times out, reduce to 500. If very fast, try 2000.

### Concurrency (`concurrency_limit`)

Edit `claidex_modal.py` line 92:
```python
concurrency_limit=300,  # Max parallel containers
```

- **300** (default) — Good for most setups
- **500** — Faster, but ensure Neo4j can handle 500 concurrent connections
- **100** — Conservative if Neo4j or network is flaky

### Memory (`memory`)

Edit `claidex_modal.py` line 94:
```python
memory=4096,  # 4GB per container
```

- **2048** (2GB) — Minimum for small batches
- **4096** (4GB) — Default, safe for batch_size=1000
- **8192** (8GB) — If you increase batch_size to 2000+

## Expected Costs

**1.78M NPIs, batch_size=1000, 300 concurrency:**

- Batches: 1,789
- Time per batch: ~10 sec
- Total container-seconds: 17,890
- CPU-seconds: 71,560 (4 vCPUs per container)
- GB-seconds: 71,560 (4 GB per container)

**Modal pricing:**
- CPU: 71,560 × $0.000030 = $2.15
- Memory: 71,560 × $0.000004 = $0.29
- **Total: ~$2.44 per run**

Free tier includes $30/month credit, so ~12 runs/month free.

## Monitoring

Real-time dashboard: https://modal.com/apps

**What to watch:**
- Batch completion rate: Should see ~300 batches running concurrently
- Neo4j query time: Each batch logs time taken
- Errors: Modal auto-retries (up to 2×), but check for persistent failures

## Common Issues

### "Neo4j ServiceUnavailable"
- **Cause:** Neo4j not accessible from Modal (firewall/network)
- **Fix:** Ensure Neo4j has public IP or use SSH tunnel/VPN

### "Batches timing out"
- **Cause:** Neo4j queries taking >15 min
- **Fix:** Reduce `--batch-size` to 500 or add indexes

### "Out of memory"
- **Cause:** Large payment datasets per batch
- **Fix:** Increase `memory=8192` or reduce batch size

### "No results"
- **Cause:** Wrong Postgres URL or volume data missing
- **Fix:** Verify `modal volume ls claidex-data /data/`

## Next Steps

1. **First run:** Follow Quick Setup above to run your first batch
2. **Validate:** Compare sample NPIs against local `risk_scores.py` output
3. **Optimize:** Tune batch size and concurrency based on your Neo4j performance
4. **Automate:** Set up Modal cron triggers for daily/weekly runs:
   ```python
   @app.function(schedule=modal.Cron("0 2 * * *"))  # Daily at 2 AM
   def scheduled_run():
       main.local()
   ```
5. **Scale:** Process incremental updates by filtering to recently updated providers

## Support

- **Detailed docs:** `etl/compute/MODAL_SETUP.md`
- **Modal docs:** https://modal.com/docs
- **GitHub issues:** Report Claidex-specific issues at your repo

---

**Ready to run?**

```bash
python etl/compute/prepare_modal_data.py
modal run etl/compute/claidex_modal.py --postgres-url "postgresql://..."
```

**That's it! Results will be in `provider_risk_scores` table in ~10 minutes.**
