ALTER TABLE customers ADD COLUMN IF NOT EXISTS external_code text;
CREATE UNIQUE INDEX IF NOT EXISTS customers_workspace_external_code_unique ON customers(workspace_id, external_code) WHERE external_code IS NOT NULL;

UPDATE customers SET external_code='northstar' WHERE external_code IS NULL AND id LIKE 'cust-northstar%';
UPDATE customers SET external_code='aster' WHERE external_code IS NULL AND id LIKE 'cust-aster%';
UPDATE customers SET external_code='polaris' WHERE external_code IS NULL AND id LIKE 'cust-polaris%';
