-- Seed data for Claidex (realistic provider data in cloud database)

-- Insert realistic providers
INSERT INTO providers (npi, entity_type_code, org_name, last_name, first_name, address_line1, city, state, zip, taxonomy_1, display_name, is_excluded) VALUES
('1234567890', 2, 'Memorial Hospital System', NULL, NULL, '1234 Medical Plaza', 'Miami', 'FL', '33101', '282N00000X', 'Memorial Hospital System', TRUE),
('2345678901', 2, 'St. Joseph Medical Center', NULL, NULL, '5678 Healthcare Dr', 'Los Angeles', 'CA', '90001', '282N00000X', 'St. Joseph Medical Center', FALSE),
('3456789012', 2, 'Northeast Healthcare Partners', NULL, NULL, '910 Provider Ave', 'New York', 'NY', '10001', '261QM0801X', 'Northeast Healthcare Partners', FALSE),
('4567890123', 2, 'Sunshine Medical Group', NULL, NULL, '234 Wellness Blvd', 'Houston', 'TX', '77001', '207Q00000X', 'Sunshine Medical Group', TRUE),
('5678901234', 2, 'Central Valley Clinic', NULL, NULL, '567 Family Care Ln', 'Chicago', 'IL', '60601', '207R00000X', 'Central Valley Clinic', FALSE),
('6789012345', 2, 'Pacific Northwest Medical', NULL, NULL, '890 Primary St', 'Seattle', 'WA', '98101', '208D00000X', 'Pacific Northwest Medical', TRUE),
('7890123456', 2, 'Metro Health Associates', NULL, NULL, '123 Multispecialty Way', 'Atlanta', 'GA', '30301', '261QM0801X', 'Metro Health Associates', FALSE),
('8901234567', 2, 'Riverside Community Hospital', NULL, NULL, '456 Emergency Pkwy', 'Phoenix', 'AZ', '85001', '282N00000X', 'Riverside Community Hospital', FALSE),
('9012345678', 2, 'Lakeside Physicians Group', NULL, NULL, '789 Doctor Dr', 'Denver', 'CO', '80201', '207Q00000X', 'Lakeside Physicians Group', FALSE),
('0123456789', 2, 'Coastal Medical Network', NULL, NULL, '321 Clinical Ave', 'Boston', 'MA', '02101', '261QM0801X', 'Coastal Medical Network', FALSE),
('1111111111', 2, 'Valley View Hospital', NULL, NULL, '111 Hospital Row', 'Sacramento', 'CA', '95814', '282N00000X', 'Valley View Hospital', FALSE),
('2222222222', 2, 'Evergreen Family Medicine', NULL, NULL, '222 Family Ln', 'Portland', 'OR', '97201', '207Q00000X', 'Evergreen Family Medicine', FALSE),
('3333333333', 2, 'Desert Springs Medical', NULL, NULL, '333 Desert Rd', 'Las Vegas', 'NV', '89101', '207R00000X', 'Desert Springs Medical', FALSE),
('4444444444', 2, 'Mountain Peak Healthcare', NULL, NULL, '444 Summit St', 'Salt Lake City', 'UT', '84101', '208D00000X', 'Mountain Peak Healthcare', FALSE),
('5555555555', 2, 'Bayfront Regional Center', NULL, NULL, '555 Bay Dr', 'San Francisco', 'CA', '94102', '282N00000X', 'Bayfront Regional Center', FALSE)
ON CONFLICT (npi) DO NOTHING;

-- Insert exclusions for excluded providers
INSERT INTO exclusions (exclusion_id, npi, business_name, display_name, excl_type, excl_type_label, excldate, reindate, state, reinstated) VALUES
('EX001', '1234567890', 'Memorial Hospital System', 'Memorial Hospital System', '1128a4', 'Conviction - Medicare/Medicaid fraud', '2023-05-15', NULL, 'FL', FALSE),
('EX002', '4567890123', 'Sunshine Medical Group', 'Sunshine Medical Group', '1128b7', 'Excessive claims or services', '2023-08-22', NULL, 'TX', FALSE),
('EX003', '6789012345', 'Pacific Northwest Medical', 'Pacific Northwest Medical', '1128b14', 'Defaulted on Health Education Loan', '2023-11-03', NULL, 'WA', FALSE)
ON CONFLICT (exclusion_id) DO NOTHING;

-- Insert Medicare Part D payment data
INSERT INTO medicare_part_d (npi, year, last_org_name, state, provider_type, total_claims, total_drug_cost, total_benes, opioid_claims, opioid_cost) VALUES
('1234567890', 2022, 'Memorial Hospital System', 'FL', 'Hospital', 10650, 2850000.50, 1200, 150, 45000),
('2345678901', 2022, 'St. Joseph Medical Center', 'CA', 'Hospital', 8500, 1950000.75, 950, 120, 38000),
('3456789012', 2022, 'Northeast Healthcare Partners', 'NY', 'Clinic', 8190, 1850000.25, 890, 95, 32000),
('5678901234', 2022, 'Central Valley Clinic', 'IL', 'Clinic', 6360, 1450000.00, 720, 75, 25000),
('7890123456', 2022, 'Metro Health Associates', 'GA', 'Clinic', 7340, 1650000.50, 810, 82, 28000),
('8901234567', 2022, 'Riverside Community Hospital', 'AZ', 'Hospital', 8930, 2100000.00, 980, 105, 35000),
('9012345678', 2022, 'Lakeside Physicians Group', 'CO', 'Clinic', 5600, 1250000.25, 650, 62, 22000),
('0123456789', 2022, 'Coastal Medical Network', 'MA', 'Clinic', 8150, 1800000.75, 870, 88, 30000),
('1111111111', 2022, 'Valley View Hospital', 'CA', 'Hospital', 9770, 2250000.00, 1050, 115, 38000),
('2222222222', 2022, 'Evergreen Family Medicine', 'OR', 'Clinic', 5240, 1150000.50, 600, 58, 20000)
ON CONFLICT (npi, year) DO NOTHING;

-- Insert provider risk scores with correct JSONB format for flags
INSERT INTO provider_risk_scores (npi, risk_score, risk_label, flags, components, updated_at) VALUES
('1234567890', 85, 'Critical', '["exclusion", "billing_outlier"]'::jsonb, '{"exclusion_score": 100, "billing_outlier_score": 0.87, "ownership_complexity": 0.45}'::jsonb, NOW()),
('2345678901', 72, 'High', '["billing_outlier"]'::jsonb, '{"exclusion_score": 0, "billing_outlier_score": 0.92, "ownership_complexity": 0.52}'::jsonb, NOW()),
('3456789012', 68, 'High', '["ownership_complexity"]'::jsonb, '{"exclusion_score": 0, "billing_outlier_score": 0.35, "ownership_complexity": 0.88}'::jsonb, NOW()),
('4567890123', 90, 'Critical', '["exclusion"]'::jsonb, '{"exclusion_score": 100, "billing_outlier_score": 0.22, "ownership_complexity": 0.31}'::jsonb, NOW()),
('5678901234', 45, 'Medium', '[]'::jsonb, '{"exclusion_score": 0, "billing_outlier_score": 0.42, "ownership_complexity": 0.28}'::jsonb, NOW()),
('6789012345', 88, 'Critical', '["exclusion"]'::jsonb, '{"exclusion_score": 100, "billing_outlier_score": 0.31, "ownership_complexity": 0.48}'::jsonb, NOW()),
('7890123456', 52, 'Medium', '["ownership_complexity"]'::jsonb, '{"exclusion_score": 0, "billing_outlier_score": 0.28, "ownership_complexity": 0.72}'::jsonb, NOW()),
('8901234567', 38, 'Low', '[]'::jsonb, '{"exclusion_score": 0, "billing_outlier_score": 0.18, "ownership_complexity": 0.22}'::jsonb, NOW()),
('9012345678', 42, 'Medium', '[]'::jsonb, '{"exclusion_score": 0, "billing_outlier_score": 0.38, "ownership_complexity": 0.35}'::jsonb, NOW()),
('0123456789', 48, 'Medium', '[]'::jsonb, '{"exclusion_score": 0, "billing_outlier_score": 0.44, "ownership_complexity": 0.41}'::jsonb, NOW())
ON CONFLICT (npi) DO UPDATE SET
  risk_score = EXCLUDED.risk_score,
  risk_label = EXCLUDED.risk_label,
  flags = EXCLUDED.flags,
  components = EXCLUDED.components,
  updated_at = NOW();

-- Insert Medicaid payment records
INSERT INTO payments_medicaid (npi, year, state, service_category, payments, claims, beneficiaries) VALUES
('1234567890', 2022, 'FL', 'Inpatient Hospital', 12500000.00, 2500, 1850),
('2345678901', 2022, 'CA', 'Inpatient Hospital', 9800000.00, 1950, 1420),
('3456789012', 2022, 'NY', 'Physician Services', 3200000.00, 8500, 2100),
('5678901234', 2022, 'IL', 'Physician Services', 2100000.00, 5600, 1350),
('7890123456', 2022, 'GA', 'Physician Services', 2850000.00, 7200, 1780),
('8901234567', 2022, 'AZ', 'Inpatient Hospital', 8900000.00, 1750, 1280),
('9012345678', 2022, 'CO', 'Physician Services', 1650000.00, 4200, 1020),
('0123456789', 2022, 'MA', 'Physician Services', 2950000.00, 7500, 1850),
('1111111111', 2022, 'CA', 'Inpatient Hospital', 11200000.00, 2200, 1620),
('2222222222', 2022, 'OR', 'Physician Services', 1450000.00, 3800, 920)
ON CONFLICT (npi, year, state, service_category) DO NOTHING;

-- Settings / Me: dev organization and user for Settings flows (use DEV_USER_ID=aaaaaaaa-0000-4000-8000-000000000002)
INSERT INTO organizations (id, name, slug, industry, billing_email, address_line1, city, state, country) VALUES
('aaaaaaaa-0000-4000-8000-000000000001', 'State Medicaid Agency', 'state-medicaid-agency', 'Medicaid agency', 'billing@state-medicaid.example', '100 Government Plaza', 'Springfield', 'IL', 'US')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, industry = EXCLUDED.industry, billing_email = EXCLUDED.billing_email, address_line1 = EXCLUDED.address_line1, city = EXCLUDED.city, state = EXCLUDED.state, country = EXCLUDED.country, updated_at = NOW();

INSERT INTO users (id, email, name, role, position, organization_id, timezone, locale, preferences) VALUES
('aaaaaaaa-0000-4000-8000-000000000002', 'dev@claidex.local', 'Dev User', 'admin', 'Medicaid Integrity Analyst', 'aaaaaaaa-0000-4000-8000-000000000001', 'America/Chicago', 'en-US', '{"default_landing":"dashboard","table_density":"comfortable","reduced_motion":false}'::jsonb)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role, position = EXCLUDED.position, organization_id = EXCLUDED.organization_id, timezone = EXCLUDED.timezone, locale = EXCLUDED.locale, preferences = EXCLUDED.preferences, updated_at = NOW();

INSERT INTO organization_members (organization_id, user_id, role) VALUES
('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 'admin')
ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW();

INSERT INTO user_notification_preferences (user_id, email_alerts, email_digest_frequency, event_severity_min, program_filter, watchlist_only) VALUES
('aaaaaaaa-0000-4000-8000-000000000002', true, 'weekly', 'high', ARRAY['Medicare','Medicaid'], false)
ON CONFLICT (user_id) DO UPDATE SET email_alerts = EXCLUDED.email_alerts, email_digest_frequency = EXCLUDED.email_digest_frequency, event_severity_min = EXCLUDED.event_severity_min, program_filter = EXCLUDED.program_filter, watchlist_only = EXCLUDED.watchlist_only, updated_at = NOW();

INSERT INTO user_security_log (user_id, action, ip_address, user_agent) VALUES
('aaaaaaaa-0000-4000-8000-000000000002', 'login', '127.0.0.1', 'Claidex-Dev'),
('aaaaaaaa-0000-4000-8000-000000000002', 'api_key_created', NULL, NULL);
