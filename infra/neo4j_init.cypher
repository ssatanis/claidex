// =============================================================================
// Claidex — Neo4j graph init  (idempotent, safe to re-run)
// =============================================================================
//
// Graph model
// -----------
//   Nodes
//     (:Provider)          npi (unique)
//     (:CorporateEntity)   entity_id (unique)
//     (:Person)            associate_id (unique)
//     (:Exclusion)         exclusion_id (unique)
//     (:PaymentSummary)    record_id (unique)  — keyed npi:year:program
//
//   Relationships
//     (:Provider)       -[:RECEIVED_PAYMENT]-> (:PaymentSummary)
//     (:Provider)       -[:EXCLUDED_BY]->      (:Exclusion)
//     (:CorporateEntity)-[:OWNS]->             (:CorporateEntity)  (org owns SNF)
//     (:CorporateEntity)-[:CONTROLLED_BY]->    (:Person)           (SNF → individual owner)
//
// CSV source files are in /var/lib/neo4j/import  (= data/exports/ on host)
//
// Statement separator: semicolon on its own line — parsed by neo4j_loader.py
// =============================================================================


// -----------------------------------------------------------------------------
// 1. CONSTRAINTS  (uniqueness + existence guarantees)
// -----------------------------------------------------------------------------

CREATE CONSTRAINT IF NOT EXISTS FOR (p:Provider)          REQUIRE p.npi           IS UNIQUE;

CREATE CONSTRAINT IF NOT EXISTS FOR (e:CorporateEntity)   REQUIRE e.entity_id     IS UNIQUE;

CREATE CONSTRAINT IF NOT EXISTS FOR (pe:Person)           REQUIRE pe.associate_id IS UNIQUE;

CREATE CONSTRAINT IF NOT EXISTS FOR (x:Exclusion)         REQUIRE x.exclusion_id  IS UNIQUE;

CREATE CONSTRAINT IF NOT EXISTS FOR (ps:PaymentSummary)   REQUIRE ps.record_id    IS UNIQUE;


// -----------------------------------------------------------------------------
// 2. INDEXES  (for fast lookup on common filter/join columns)
// -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS FOR (p:Provider)         ON (p.state);

CREATE INDEX IF NOT EXISTS FOR (p:Provider)         ON (p.isExcluded);

CREATE INDEX IF NOT EXISTS FOR (e:CorporateEntity)  ON (e.state);

CREATE INDEX IF NOT EXISTS FOR (e:CorporateEntity)  ON (e.entityType);

CREATE INDEX IF NOT EXISTS FOR (x:Exclusion)        ON (x.exclType);

CREATE INDEX IF NOT EXISTS FOR (ps:PaymentSummary)  ON (ps.year);

CREATE INDEX IF NOT EXISTS FOR (ps:PaymentSummary)  ON (ps.program);


// -----------------------------------------------------------------------------
// 3. PROVIDER NODES
//    Source: nodes_providers.csv
//    Columns: npi, display_name, entity_type, city, state, zip,
//             taxonomy_1, is_excluded
// -----------------------------------------------------------------------------

LOAD CSV WITH HEADERS FROM 'file:///nodes_providers.csv' AS row
CALL {
  WITH row
  MERGE (p:Provider {npi: row.npi})
  SET p.name       = row.display_name,
      p.entityType = row.entity_type,
      p.city       = row.city,
      p.state      = row.state,
      p.zip        = row.zip,
      p.taxonomy   = row.taxonomy_1,
      p.isExcluded = toBoolean(row.is_excluded)
} IN TRANSACTIONS OF 10000 ROWS;


// -----------------------------------------------------------------------------
// 4. CORPORATE ENTITY NODES
//    Source: nodes_entities.csv
//    Columns: entity_id, name, dba, city, state, zip, entity_type,
//             flag_corporation, flag_llc, flag_holding_company,
//             flag_investment_firm, flag_private_equity,
//             flag_for_profit, flag_non_profit
// -----------------------------------------------------------------------------

LOAD CSV WITH HEADERS FROM 'file:///nodes_entities.csv' AS row
CALL {
  WITH row
  MERGE (e:CorporateEntity {entity_id: row.entity_id})
  SET e.name             = row.name,
      e.dba              = row.dba,
      e.city             = row.city,
      e.state            = row.state,
      e.zip              = row.zip,
      e.entityType       = row.entity_type,
      e.isCorporation    = toBoolean(row.flag_corporation),
      e.isLLC            = toBoolean(row.flag_llc),
      e.isHoldingCompany = toBoolean(row.flag_holding_company),
      e.isInvestmentFirm = toBoolean(row.flag_investment_firm),
      e.isPrivateEquity  = toBoolean(row.flag_private_equity),
      e.isForProfit      = toBoolean(row.flag_for_profit),
      e.isNonProfit      = toBoolean(row.flag_non_profit)
} IN TRANSACTIONS OF 10000 ROWS;


// -----------------------------------------------------------------------------
// 5. PERSON NODES
//    Source: nodes_persons.csv
//    Columns: associate_id, last_name, first_name, middle_name, title,
//             city, state
// -----------------------------------------------------------------------------

LOAD CSV WITH HEADERS FROM 'file:///nodes_persons.csv' AS row
CALL {
  WITH row
  MERGE (pe:Person {associate_id: row.associate_id})
  SET pe.lastName   = row.last_name,
      pe.firstName  = row.first_name,
      pe.middleName = row.middle_name,
      pe.title      = row.title,
      pe.city       = row.city,
      pe.state      = row.state
} IN TRANSACTIONS OF 10000 ROWS;


// -----------------------------------------------------------------------------
// 6. EXCLUSION NODES
//    Source: nodes_exclusions.csv
//    Columns: exclusion_id, source, display_name, excl_type, excl_type_label,
//             excldate, reinstated, state
// -----------------------------------------------------------------------------

LOAD CSV WITH HEADERS FROM 'file:///nodes_exclusions.csv' AS row
CALL {
  WITH row
  MERGE (x:Exclusion {exclusion_id: row.exclusion_id})
  SET x.source     = row.source,
      x.name       = row.display_name,
      x.exclType   = row.excl_type,
      x.exclLabel  = row.excl_type_label,
      x.exclDate   = CASE
                       WHEN row.excldate IS NOT NULL AND row.excldate <> ''
                       THEN date(row.excldate)
                       ELSE null
                     END,
      x.reinstated = toBoolean(row.reinstated),
      x.state      = row.state
} IN TRANSACTIONS OF 10000 ROWS;


// -----------------------------------------------------------------------------
// 7. PAYMENT SUMMARY NODES  +  RECEIVED_PAYMENT edges
//    Source: edges_payments.csv
//    Columns: record_id, npi, year, program, payments, allowed,
//             claims, beneficiaries
//
//    Uses OPTIONAL MATCH so rows whose NPI has no Provider node are skipped
//    gracefully (rather than raising an error).
// -----------------------------------------------------------------------------

LOAD CSV WITH HEADERS FROM 'file:///edges_payments.csv' AS row
CALL {
  WITH row
  MATCH (p:Provider {npi: row.npi})
  MERGE (ps:PaymentSummary {record_id: row.record_id})
  SET ps.npi           = row.npi,
      ps.year          = toInteger(row.year),
      ps.program       = row.program,
      ps.payments      = CASE WHEN row.payments      IS NOT NULL AND row.payments      <> '' THEN toFloat(row.payments)      ELSE null END,
      ps.allowed       = CASE WHEN row.allowed        IS NOT NULL AND row.allowed        <> '' THEN toFloat(row.allowed)        ELSE null END,
      ps.claims        = CASE WHEN row.claims         IS NOT NULL AND row.claims         <> '' THEN toFloat(row.claims)         ELSE null END,
      ps.beneficiaries = CASE WHEN row.beneficiaries  IS NOT NULL AND row.beneficiaries  <> '' THEN toFloat(row.beneficiaries)  ELSE null END
  MERGE (p)-[:RECEIVED_PAYMENT]->(ps)
} IN TRANSACTIONS OF 10000 ROWS;


// -----------------------------------------------------------------------------
// 8. EXCLUDED_BY edges
//    Source: edges_exclusions.csv
//    Columns: npi, exclusion_id, excldate
// -----------------------------------------------------------------------------

LOAD CSV WITH HEADERS FROM 'file:///edges_exclusions.csv' AS row
CALL {
  WITH row
  MATCH (p:Provider  {npi:          row.npi})
  MATCH (x:Exclusion {exclusion_id: row.exclusion_id})
  MERGE (p)-[r:EXCLUDED_BY]->(x)
  SET r.exclDate = CASE
                     WHEN row.excldate IS NOT NULL AND row.excldate <> ''
                     THEN date(row.excldate)
                     ELSE null
                   END
} IN TRANSACTIONS OF 10000 ROWS;


// -----------------------------------------------------------------------------
// 9a. OWNS edges  (org owner → SNF)
//     Source: edges_ownership.csv  (rows where from_type = 'O')
//     Columns: from_id, from_type, to_id, role_code, role_text,
//              association_date, ownership_pct
// -----------------------------------------------------------------------------

LOAD CSV WITH HEADERS FROM 'file:///edges_ownership.csv' AS row
CALL {
  WITH row
  MATCH (owner:CorporateEntity {entity_id: row.from_id})
  WHERE row.from_type = 'O'
  MATCH (snf:CorporateEntity {entity_id: row.to_id})
  MERGE (owner)-[r:OWNS]->(snf)
  SET r.ownershipPct    = CASE WHEN row.ownership_pct   IS NOT NULL AND row.ownership_pct   <> '' THEN toFloat(row.ownership_pct) ELSE null END,
      r.roleCode        = row.role_code,
      r.roleText        = row.role_text,
      r.associationDate = CASE WHEN row.association_date IS NOT NULL AND row.association_date <> '' THEN date(row.association_date) ELSE null END
} IN TRANSACTIONS OF 10000 ROWS;


// -----------------------------------------------------------------------------
// 9b. CONTROLLED_BY edges  (SNF → individual owner)
//     Source: edges_ownership.csv  (rows where from_type = 'I')
//     Semantic: the SNF entity is controlled by this person
// -----------------------------------------------------------------------------

LOAD CSV WITH HEADERS FROM 'file:///edges_ownership.csv' AS row
CALL {
  WITH row
  MATCH (pe:Person {associate_id: row.from_id})
  WHERE row.from_type = 'I'
  MATCH (snf:CorporateEntity {entity_id: row.to_id})
  MERGE (snf)-[r:CONTROLLED_BY]->(pe)
  SET r.roleCode        = row.role_code,
      r.roleText        = row.role_text,
      r.associationDate = CASE WHEN row.association_date IS NOT NULL AND row.association_date <> '' THEN date(row.association_date) ELSE null END
} IN TRANSACTIONS OF 10000 ROWS;
