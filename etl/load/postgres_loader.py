"""
Load processed data into Postgres.
"""
import os
import pandas as pd
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

CONN = {
    "host": os.environ.get("POSTGRES_HOST", "localhost"),
    "port": os.environ.get("POSTGRES_PORT", "5432"),
    "dbname": os.environ.get("POSTGRES_DB", "claidex"),
    "user": os.environ.get("POSTGRES_USER", "claidex"),
    "password": os.environ.get("POSTGRES_PASSWORD", ""),
}


def get_conn():
    return psycopg2.connect(**CONN)


def load_providers(df: pd.DataFrame) -> int:
    """Bulk load providers. Table must exist (see schemas/)."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # TODO: use COPY or executemany from df
            conn.commit()
            return len(df)
    finally:
        conn.close()


def load_exclusions(df: pd.DataFrame) -> int:
    """Bulk load exclusions (LEIE)."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # TODO: COPY from df
            conn.commit()
            return len(df)
    finally:
        conn.close()
