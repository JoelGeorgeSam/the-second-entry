ALTER TABLE inference_records ADD COLUMN IF NOT EXISTS worker_status text NOT NULL DEFAULT 'not_requested';
ALTER TABLE inference_records ADD COLUMN IF NOT EXISTS worker_failure text;
ALTER TABLE inference_records ADD COLUMN IF NOT EXISTS worker_processing_id text;

UPDATE inference_records i
SET worker_status = COALESCE(
  (SELECT j.status FROM processing_jobs j WHERE j.exception_id=i.exception_id ORDER BY j.created_at DESC LIMIT 1),
  'not_requested'
);
