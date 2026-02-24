"""
Neo4j sanity-check script for Claidex.

Connects to Neo4j (using NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD from .env),
runs a set of diagnostic queries, and prints human-readable results.

Usage
-----
  python scripts/check_neo4j_basic.py
  python scripts/check_neo4j_basic.py --uri bolt://localhost:7687
"""
import argparse
import os
import sys
from pathlib import Path

# Allow running from repo root or scripts/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
from neo4j import GraphDatabase, exceptions as neo4j_exc

load_dotenv()

NEO4J_URI      = os.environ.get("NEO4J_URI",      "bolt://localhost:7687")
NEO4J_USER     = os.environ.get("NEO4J_USER",     "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "")


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

CHECKS: list[tuple[str, str, str]] = [
    # (label, cypher, result_key)
    (
        "Provider nodes",
        "MATCH (p:Provider) RETURN count(p) AS n",
        "n",
    ),
    (
        "CorporateEntity nodes",
        "MATCH (e:CorporateEntity) RETURN count(e) AS n",
        "n",
    ),
    (
        "Person nodes",
        "MATCH (pe:Person) RETURN count(pe) AS n",
        "n",
    ),
    (
        "Exclusion nodes",
        "MATCH (x:Exclusion) RETURN count(x) AS n",
        "n",
    ),
    (
        "PaymentSummary nodes",
        "MATCH (ps:PaymentSummary) RETURN count(ps) AS n",
        "n",
    ),
    (
        "Providers with ≥1 RECEIVED_PAYMENT",
        "MATCH (p:Provider)-[:RECEIVED_PAYMENT]->() RETURN count(DISTINCT p) AS n",
        "n",
    ),
    (
        "Providers with EXCLUDED_BY",
        "MATCH (p:Provider)-[:EXCLUDED_BY]->() RETURN count(DISTINCT p) AS n",
        "n",
    ),
    (
        "OWNS relationships (org → SNF)",
        "MATCH ()-[r:OWNS]->() RETURN count(r) AS n",
        "n",
    ),
    (
        "CONTROLLED_BY relationships (SNF → person)",
        "MATCH ()-[r:CONTROLLED_BY]->() RETURN count(r) AS n",
        "n",
    ),
    (
        "Medicaid payment edges",
        "MATCH (p:Provider)-[r:RECEIVED_PAYMENT]->(ps:PaymentSummary) WHERE ps.program = 'Medicaid' RETURN count(r) AS n",
        "n",
    ),
    (
        "Medicare payment edges",
        "MATCH (p:Provider)-[r:RECEIVED_PAYMENT]->(ps:PaymentSummary) WHERE ps.program = 'Medicare' RETURN count(r) AS n",
        "n",
    ),
    (
        "MedicarePartD payment edges",
        "MATCH (p:Provider)-[r:RECEIVED_PAYMENT]->(ps:PaymentSummary) WHERE ps.program = 'MedicarePartD' RETURN count(r) AS n",
        "n",
    ),
    (
        "RECEIVED_PAYMENT by program (all)",
        "MATCH ()-[:RECEIVED_PAYMENT]->(ps:PaymentSummary) RETURN count(ps) AS n",
        "n",
    ),
]

TOP_PROVIDERS_QUERY = """
MATCH (p:Provider)-[:RECEIVED_PAYMENT]->(ps:PaymentSummary)
WITH p, sum(ps.payments) AS total_payments
ORDER BY total_payments DESC
LIMIT 10
RETURN p.npi AS npi, p.name AS name, p.state AS state,
       round(total_payments / 1e6, 2) AS total_payments_m
"""

EXCLUDED_PROVIDERS_QUERY = """
MATCH (p:Provider)-[:EXCLUDED_BY]->(x:Exclusion)
RETURN p.npi AS npi, p.name AS name, x.exclType AS excl_type,
       x.exclDate AS excl_date
ORDER BY excl_date DESC
LIMIT 10
"""

OWNERSHIP_CHAINS_QUERY = """
MATCH path = (owner:CorporateEntity)-[:OWNS*1..3]->(snf:CorporateEntity)
WHERE length(path) > 1
RETURN owner.name AS owner, snf.name AS snf, length(path) AS depth
ORDER BY depth DESC
LIMIT 5
"""

PAYMENT_PROGRAMS_QUERY = """
MATCH ()-[:RECEIVED_PAYMENT]->(ps:PaymentSummary)
RETURN ps.program AS program, count(ps) AS n
ORDER BY n DESC
"""

MULTI_PROGRAM_QUERY = """
MATCH (p:Provider)-[:RECEIVED_PAYMENT]->(ps:PaymentSummary)
WITH p, collect(DISTINCT ps.program) AS programs
WHERE size(programs) > 2
RETURN p.npi AS npi, p.name AS name, programs
ORDER BY size(programs) DESC
LIMIT 5
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _connect(uri: str, user: str, password: str):
    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        driver.verify_connectivity()
    except neo4j_exc.ServiceUnavailable:
        print(f"\n✗  Cannot connect to Neo4j at {uri}")
        print("   Is the container running?  →  docker compose -f infra/docker-compose.yml up -d neo4j")
        sys.exit(1)
    except neo4j_exc.AuthError:
        print(f"\n✗  Authentication failed — check NEO4J_PASSWORD in .env")
        sys.exit(1)
    return driver


def _hr(title: str) -> None:
    width = 64
    print(f"\n{'─' * width}")
    print(f"  {title}")
    print(f"{'─' * width}")


def _run_scalar(session, cypher: str, key: str):
    result = session.run(cypher)
    record = result.single()
    return record[key] if record else None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(uri: str, user: str, password: str) -> None:
    print(f"\nConnecting to {uri} …")
    driver = _connect(uri, user, password)

    with driver.session() as session:
        # --- Node / relationship counts ---
        _hr("Graph counts")
        max_label_len = max(len(label) for label, _, _ in CHECKS)
        for label, cypher, key in CHECKS:
            val = _run_scalar(session, cypher, key)
            if val is None:
                print(f"  {'?':>12}  {label}")
            else:
                print(f"  {val:>12,}  {label}")

        # --- Top 10 providers by total payments ---
        _hr("Top 10 providers by total Medicare/Medicaid payments (USD millions)")
        rows = session.run(TOP_PROVIDERS_QUERY).data()
        if rows:
            print(f"  {'NPI':<12}  {'$M':>8}  {'State':5}  Name")
            print(f"  {'-'*12}  {'-'*8}  {'-'*5}  {'-'*40}")
            for r in rows:
                print(f"  {r['npi'] or '—':<12}  {r['total_payments_m'] or 0:>8.2f}  "
                      f"{r['state'] or '?':5}  {r['name'] or '(no name)'}")
        else:
            print("  (no data — run the loader first)")

        # --- Sample excluded providers ---
        _hr("10 most recently excluded providers (EXCLUDED_BY)")
        rows = session.run(EXCLUDED_PROVIDERS_QUERY).data()
        if rows:
            print(f"  {'NPI':<12}  {'Excl date':<12}  {'Type':<10}  Name")
            print(f"  {'-'*12}  {'-'*12}  {'-'*10}  {'-'*40}")
            for r in rows:
                print(f"  {r['npi'] or '—':<12}  {str(r['excl_date'] or '?'):<12}  "
                      f"{r['excl_type'] or '?':<10}  {r['name'] or '(no name)'}")
        else:
            print("  (no data)")

        # --- Multi-hop ownership chains ---
        _hr("Ownership chains (depth > 1)")
        rows = session.run(OWNERSHIP_CHAINS_QUERY).data()
        if rows:
            for r in rows:
                print(f"  depth={r['depth']}  {r['owner'] or '?'}  →…→  {r['snf'] or '?'}")
        else:
            print("  (none found)")

        # --- RECEIVED_PAYMENT breakdown by program ---
        _hr("RECEIVED_PAYMENT count by program")
        rows = session.run(PAYMENT_PROGRAMS_QUERY).data()
        if rows:
            print(f"  {'Program':<20}  {'Count':>12}")
            print(f"  {'-'*20}  {'-'*12}")
            for r in rows:
                print(f"  {r['program'] or '(null)':<20}  {r['n']:>12,}")
        else:
            print("  (no payment data)")

        # --- Providers with >2 programs ---
        _hr("Sample providers with >2 distinct payment programs")
        rows = session.run(MULTI_PROGRAM_QUERY).data()
        if rows:
            print(f"  {'NPI':<12}  {'Programs':<40}  Name")
            print(f"  {'-'*12}  {'-'*40}  {'-'*40}")
            for r in rows:
                progs = ", ".join(sorted(r['programs']))
                print(f"  {r['npi'] or '—':<12}  {progs:<40}  {r['name'] or '(no name)'}")
        else:
            print("  (no providers found with >2 programs)")

    driver.close()
    print("\n✓  Done\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Claidex Neo4j sanity checks")
    parser.add_argument("--uri",      default=NEO4J_URI,      help="Bolt URI")
    parser.add_argument("--user",     default=NEO4J_USER,     help="Username")
    parser.add_argument("--password", default=NEO4J_PASSWORD, help="Password")
    args = parser.parse_args()
    main(args.uri, args.user, args.password)
