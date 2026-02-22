"""
Load graph data (providers, entities, ownership) into Neo4j.
"""
import os
from pathlib import Path
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()

URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
USER = os.environ.get("NEO4J_USER", "neo4j")
PASSWORD = os.environ.get("NEO4J_PASSWORD", "")


def get_driver():
    return GraphDatabase.driver(URI, auth=(USER, PASSWORD))


def load_from_csv_export(export_dir: Path) -> None:
    """Run Neo4j LOAD CSV from export_dir (e.g. data/exports)."""
    driver = get_driver()
    with driver.session() as session:
        # Example: session.run("LOAD CSV FROM $uri AS row ...", uri="file:///...")
        pass
    driver.close()
