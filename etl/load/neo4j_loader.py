"""
Neo4j loader for Claidex.

Steps
-----
1. Export all processed Parquets → CSVs in data/exports/
   (mounted as /var/lib/neo4j/import inside Docker).
2. Read infra/neo4j_init.cypher and execute each statement in order
   via the Bolt driver, logging progress and result counters.

Usage
-----
  python etl/load/neo4j_loader.py [all|export|load]

  all    (default) — export CSVs then load graph
  export           — export CSVs only
  load             — load graph only (CSVs must already exist)
"""
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from neo4j import GraphDatabase, exceptions as neo4j_exc

# Allow running from repo root or etl/load/
_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT))

load_dotenv()

NEO4J_URI      = os.environ.get("NEO4J_URI",      "bolt://localhost:7688")
NEO4J_USER     = os.environ.get("NEO4J_USER",     "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "")
_exports_default = _REPO_ROOT / "data" / "exports"
EXPORTS        = Path(os.environ.get("DATA_EXPORTS", str(_exports_default)))
if not EXPORTS.is_absolute():
    EXPORTS = _REPO_ROOT / EXPORTS
CYPHER_INIT    = _REPO_ROOT / "infra" / "neo4j_init.cypher"

# Validate password is set
if not NEO4J_PASSWORD:
    raise ValueError(
        "NEO4J_PASSWORD not set in environment.\n"
        "  Set in .env: NEO4J_PASSWORD=yourpassword\n"
        "  Or export: export NEO4J_PASSWORD=yourpassword"
    )

# Large-import statements log at a lower verbosity
LARGE_IMPORT_PREFIXES = ("LOAD CSV",)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [neo4j] %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("neo4j_loader")


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def _driver():
    return GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))


def _verify_connection(driver) -> None:
    try:
        driver.verify_connectivity()
        log.info("Connected to Neo4j at %s", NEO4J_URI)
    except neo4j_exc.ServiceUnavailable as e:
        log.error(
            "Cannot reach Neo4j at %s — is the container running?\n"
            "  docker compose -f infra/docker-compose.yml up -d neo4j",
            NEO4J_URI,
        )
        raise SystemExit(1) from e
    except neo4j_exc.AuthError as e:
        log.error("Neo4j authentication failed — check NEO4J_PASSWORD in .env")
        raise SystemExit(1) from e


# ---------------------------------------------------------------------------
# CSV validation
# ---------------------------------------------------------------------------

# Maps each expected CSV to its required header columns
_REQUIRED_COLUMNS: dict[str, list[str]] = {
    "nodes_providers.csv":  ["npi", "display_name"],
    "nodes_entities.csv":   ["entity_id", "name"],
    "nodes_persons.csv":    ["associate_id"],
    "nodes_exclusions.csv": ["exclusion_id", "source"],
    "edges_payments.csv":   ["record_id", "npi", "year", "program"],
    "edges_exclusions.csv": ["npi", "exclusion_id"],
    "edges_ownership.csv":  ["from_id", "from_type", "to_id"],
}


def _validate_exports() -> None:
    """Raise clearly if any expected CSV is missing or missing required columns."""
    import csv

    errors: list[str] = []
    for filename, required_cols in _REQUIRED_COLUMNS.items():
        path = EXPORTS / filename
        if not path.exists():
            errors.append(f"  MISSING: {path}")
            continue
        with path.open(newline="") as f:
            reader = csv.reader(f)
            try:
                header = next(reader)
            except StopIteration:
                errors.append(f"  EMPTY: {path}")
                continue
        actual = set(header)
        missing = [c for c in required_cols if c not in actual]
        if missing:
            errors.append(f"  COLUMN MISMATCH in {filename}: expected {missing}, got {sorted(actual)}")

    if errors:
        raise ValueError(
            "Export validation failed:\n" + "\n".join(errors) +
            "\n\nRun 'python etl/export_for_neo4j.py' first."
        )
    log.info("All %d export CSVs validated OK", len(_REQUIRED_COLUMNS))


# ---------------------------------------------------------------------------
# Cypher parsing
# ---------------------------------------------------------------------------

def _parse_cypher(path: Path) -> list[str]:
    """
    Read neo4j_init.cypher and split into individual executable statements.

    Neo4j handles // comments natively over Bolt, so we do NOT strip them here
    (which would corrupt file:/// URLs).  We simply split on ';' and drop empty
    chunks.
    """
    if not path.exists():
        raise FileNotFoundError(f"Cypher init file not found: {path}")

    raw = path.read_text(encoding="utf-8")

    parts = raw.split(";")
    statements = []
    for part in parts:
        stmt = part.strip()
        # Skip chunks that are only whitespace or only comment lines
        non_comment = "\n".join(
            line for line in stmt.splitlines() if not line.strip().startswith("//")
        ).strip()
        if non_comment:
            statements.append(stmt)

    log.info("Parsed %d Cypher statements from %s", len(statements), path.name)
    return statements


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

def _fmt_counters(summary) -> str:
    c = summary.counters
    parts = []
    if c.nodes_created:
        parts.append(f"+{c.nodes_created} nodes")
    if c.nodes_deleted:
        parts.append(f"-{c.nodes_deleted} nodes")
    if c.relationships_created:
        parts.append(f"+{c.relationships_created} rels")
    if c.relationships_deleted:
        parts.append(f"-{c.relationships_deleted} rels")
    if c.properties_set:
        parts.append(f"{c.properties_set} props set")
    if c.constraints_added:
        parts.append(f"+{c.constraints_added} constraints")
    if c.indexes_added:
        parts.append(f"+{c.indexes_added} indexes")
    return ", ".join(parts) if parts else "no changes"


def _run_statements(statements: list[str]) -> None:
    driver = _driver()
    _verify_connection(driver)

    try:
        with driver.session() as session:
            for i, stmt in enumerate(statements, 1):
                # Build a short label for logging (first non-blank line, truncated)
                first_line = next((l.strip() for l in stmt.splitlines() if l.strip()), "")
                label = first_line[:80] + ("…" if len(first_line) > 80 else "")

                is_large = any(stmt.upper().lstrip().startswith(p) for p in LARGE_IMPORT_PREFIXES)
                log.info("  [%2d/%d] %s", i, len(statements), label)

                try:
                    result = session.run(stmt)
                    summary = result.consume()
                    counters_str = _fmt_counters(summary)
                    level = logging.DEBUG if is_large and not counters_str.startswith("+") else logging.INFO
                    log.log(level, "         ✓  %s  (%.1fs)", counters_str, summary.result_available_after / 1000)
                except neo4j_exc.CypherSyntaxError as e:
                    log.error("Cypher syntax error in statement %d:\n%s\n\nError: %s", i, stmt, e)
                    raise
                except neo4j_exc.ClientError as e:
                    # Non-fatal: e.g. constraint already exists
                    if "already exists" in str(e):
                        log.debug("         ↷  already exists, skipped")
                    else:
                        log.error("Client error in statement %d: %s", i, e)
                        raise
    finally:
        driver.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def load_all(mode: str = "all") -> None:
    if mode in ("all", "export"):
        log.info("=== Step 1: Export Parquets → CSVs ===")
        # Dynamic import so the loader can run standalone or as part of a package
        import importlib.util
        export_path = Path(__file__).resolve().parents[2] / "etl" / "export_for_neo4j.py"
        spec = importlib.util.spec_from_file_location("export_for_neo4j", export_path)
        mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        mod.export_all()

    if mode in ("all", "load"):
        log.info("=== Step 2: Validate CSVs ===")
        _validate_exports()

        log.info("=== Step 3: Execute neo4j_init.cypher ===")
        statements = _parse_cypher(CYPHER_INIT)
        _run_statements(statements)

    log.info("=== Done ===")


# Sanity checks (run from repo root after pipeline fixes):
#   ./scripts/docker-up.sh postgres neo4j
#   ./scripts/init-postgres-schemas.sh
#   cd etl && python ingest/nppes_ingest.py && python transform/providers_transform.py && python load/neo4j_loader.py all
#   cd .. && python scripts/check_neo4j_basic.py   # expect >0 Provider nodes
#   cd api && npm run build && npm start
#   curl "http://localhost:4001/v1/providers/1316250707"  # expect 200 + JSON

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    if mode not in ("all", "export", "load"):
        print(f"Usage: neo4j_loader.py [all|export|load]  (got: {mode!r})", file=sys.stderr)
        sys.exit(1)
    load_all(mode)
