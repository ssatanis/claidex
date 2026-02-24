-- Medicare Order and Referring Providers.
-- Lists NPIs eligible to order/refer services under Medicare Part B, DME,
-- HHA, PMD, and Hospice programs.
-- Source: CMS Order and Referring file
-- Updated: 2026-02-19

CREATE TABLE IF NOT EXISTS order_referring (
    npi               TEXT    NOT NULL PRIMARY KEY,
    last_name         TEXT,
    first_name        TEXT,
    eligible_partb    BOOLEAN NOT NULL DEFAULT FALSE,
    eligible_dme      BOOLEAN NOT NULL DEFAULT FALSE,
    eligible_hha      BOOLEAN NOT NULL DEFAULT FALSE,
    eligible_pmd      BOOLEAN NOT NULL DEFAULT FALSE,
    eligible_hospice  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_order_referring_partb    ON order_referring (eligible_partb) WHERE eligible_partb = TRUE;
CREATE INDEX IF NOT EXISTS idx_order_referring_dme      ON order_referring (eligible_dme)   WHERE eligible_dme   = TRUE;
CREATE INDEX IF NOT EXISTS idx_order_referring_hospice  ON order_referring (eligible_hospice) WHERE eligible_hospice = TRUE;
