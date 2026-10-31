ALTER TABLE exceptions ADD COLUMN IF NOT EXISTS risk_processing_status text NOT NULL DEFAULT 'not_requested';
ALTER TABLE exceptions ADD COLUMN IF NOT EXISTS risk_processing_failure text;

UPDATE exceptions e
SET risk_processing_status = COALESCE(
  (SELECT j.status FROM processing_jobs j WHERE j.exception_id=e.id ORDER BY j.created_at DESC LIMIT 1),
  'not_requested'
);
