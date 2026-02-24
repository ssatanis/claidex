CREATE TABLE IF NOT EXISTS ownership_snf (
    enrollment_id           TEXT,
    provider_associate_id   TEXT,
    provider_org_name       TEXT,
    owner_associate_id      TEXT,
    owner_type              CHAR(1),            -- O=Organization, I=Individual
    role_code               TEXT,
    role_text               TEXT,
    association_date        DATE,
    ownership_pct           NUMERIC(5,2),
    PRIMARY KEY (enrollment_id, owner_associate_id)
);

CREATE INDEX IF NOT EXISTS idx_snf_owner_id   ON ownership_snf (owner_associate_id);
CREATE INDEX IF NOT EXISTS idx_snf_enroll_id  ON ownership_snf (enrollment_id);
