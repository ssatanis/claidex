"""
Entity resolution: match and merge provider/entity records across sources.
"""
import pandas as pd
from pathlib import Path


def resolve_entities(providers_df: pd.DataFrame, entities_df: pd.DataFrame) -> pd.DataFrame:
    """Stub: return entities with optional merged keys."""
    return entities_df


if __name__ == "__main__":
    # Example: load from processed/ and write resolved output
    pass
