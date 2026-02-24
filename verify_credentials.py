"""
Quick script to verify your database credentials before running Modal pipeline.
"""
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv(Path(__file__).parent / ".env")

print("=" * 80)
print("Claidex Credentials Verification")
print("=" * 80)
print()

# Check Neo4j credentials
print("Neo4j Configuration:")
print("-" * 80)
neo4j_uri = os.environ.get("NEO4J_URI", "not set")
neo4j_user = os.environ.get("NEO4J_USER", "not set")
neo4j_password = os.environ.get("NEO4J_PASSWORD", "not set")

print(f"URI:      {neo4j_uri}")
print(f"User:     {neo4j_user}")
print(f"Password: {'*' * len(neo4j_password) if neo4j_password != 'not set' else 'not set'}")
print()

if neo4j_password != "not set":
    print(f"✓ Your Neo4j password is: {neo4j_password}")
    print()

# Test Neo4j connection
print("Testing Neo4j connection...")
try:
    driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
    driver.verify_connectivity()
    print("✓ Neo4j connection successful!")

    # Check node counts
    with driver.session() as session:
        result = session.run("MATCH (p:Provider) RETURN count(p) as count")
        provider_count = result.single()["count"]

        result = session.run("MATCH (ce:CorporateEntity) RETURN count(ce) as count")
        entity_count = result.single()["count"]

        result = session.run("MATCH ()-[r:OWNS]->() RETURN count(r) as count")
        owns_count = result.single()["count"]

        print(f"  - Provider nodes: {provider_count:,}")
        print(f"  - CorporateEntity nodes: {entity_count:,}")
        print(f"  - OWNS relationships: {owns_count:,}")

    driver.close()
except Exception as e:
    print(f"✗ Neo4j connection failed: {e}")
    print()
    print("  Common issues:")
    print("  - If using Docker Neo4j on localhost, Modal can't reach it (needs cloud Neo4j)")
    print("  - Check firewall settings")
    print("  - Verify URI format: bolt://host:port")

print()

# Check Postgres credentials
print("Postgres Configuration:")
print("-" * 80)
postgres_url = (
    os.environ.get("DATABASE_URL")
    or os.environ.get("POSTGRES_URL")
    or os.environ.get("NEON_PROVIDERS_URL")
)

if postgres_url:
    # Mask password in output
    masked_url = postgres_url
    if "@" in masked_url and ":" in masked_url:
        parts = masked_url.split("@")
        if ":" in parts[0]:
            user_pass = parts[0].split(":")
            masked_url = f"{user_pass[0]}:{user_pass[1]}:***@{parts[1]}"
    print(f"URL: {masked_url}")
else:
    print("No POSTGRES_URL or NEON_PROVIDERS_URL found in .env")

print()

# Test Postgres connection
print("Testing Postgres connection...")
try:
    conn = psycopg2.connect(postgres_url, sslmode="require" if "neon.tech" in postgres_url else "prefer")
    cur = conn.cursor()

    # Check required tables
    cur.execute("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('providers', 'exclusions', 'payments_medicaid', 'payments_medicare', 'medicare_part_d')
        ORDER BY table_name
    """)
    tables = [row[0] for row in cur.fetchall()]

    print("✓ Postgres connection successful!")
    print(f"  Tables found: {', '.join(tables)}")

    # Check if payments_combined_v view exists
    cur.execute("""
        SELECT table_name
        FROM information_schema.views
        WHERE table_schema = 'public'
        AND table_name = 'payments_combined_v'
    """)
    if cur.fetchone():
        print("  ✓ payments_combined_v view exists")

        # Get row counts
        cur.execute("SELECT COUNT(*) FROM providers")
        provider_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM exclusions")
        exclusion_count = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM payments_combined_v")
        payment_count = cur.fetchone()[0]

        print()
        print("  Row counts:")
        print(f"    - Providers: {provider_count:,}")
        print(f"    - Exclusions: {exclusion_count:,}")
        print(f"    - Payments (combined view): {payment_count:,}")
    else:
        print("  ✗ payments_combined_v view NOT found")
        print("    Run: psql -f etl/schemas/risk_scores.sql")

    conn.close()

except Exception as e:
    print(f"✗ Postgres connection failed: {e}")

print()
print("=" * 80)
print("Summary")
print("=" * 80)
print()
print("If both connections succeeded, you're ready to run:")
print()
print("  python etl/compute/prepare_modal_data.py")
print()
print("If Neo4j is on localhost (Docker), you'll need cloud Neo4j for Modal:")
print("  - Neo4j AuraDB (free tier available)")
print("  - Deploy to AWS/GCP/Azure")
print()
print("=" * 80)
