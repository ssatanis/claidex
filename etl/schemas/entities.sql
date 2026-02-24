CREATE TABLE IF NOT EXISTS corporate_entities (
    entity_id           TEXT PRIMARY KEY,   -- CMS associate ID
    name                TEXT,
    dba                 TEXT,
    address             TEXT,
    city                TEXT,
    state               CHAR(2),
    zip                 TEXT,
    flag_corporation    BOOLEAN,
    flag_llc            BOOLEAN,
    flag_holding_company BOOLEAN,
    flag_investment_firm BOOLEAN,
    flag_private_equity BOOLEAN,
    flag_for_profit     BOOLEAN,
    flag_non_profit     BOOLEAN,
    flag_parent_company BOOLEAN,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_name_fts
    ON corporate_entities USING gin(to_tsvector('english', coalesce(name, '')));
