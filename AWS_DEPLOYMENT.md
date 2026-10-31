# AWS Deployment Status

**Not deployed and not authorized.** Local code includes an SQS publisher, Lambda TypeScript worker, signed callback, durable jobs/outbox, retry/dead-letter states, SAM queue/DLQ/function/log retention, SecureString dynamic reference, and DLQ alarm definition.

`npm run aws:validate` performs nine local structural assertions. It is not `sam validate --lint`. SAM CLI and live AWS execution are blocked/unverified.

Before any deployment: review account permissions and regional pricing; create the callback secret as an existing SSM SecureString; set a private HTTPS callback URL; run `sam build` and `sam validate --lint`; review the generated change set; test SQS/Lambda/DLQ/CloudWatch; and document teardown. Configure Vercel `CRON_SECRET`, `RISK_QUEUE_URL`, and `AWS_REGION`; the scheduled dispatcher fails closed when authentication or the durable queue is absent. SQS, Lambda, CloudWatch logs/alarms, and secret storage may incur charges; free-tier eligibility is never assumed.
