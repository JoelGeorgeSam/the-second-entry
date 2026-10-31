import { readFile } from "node:fs/promises";
import path from "node:path";

const source = await readFile(path.join(process.cwd(), "aws", "template.yaml"), "utf8");
const assertions: [string, RegExp][] = [
  ["SAM transform", /^Transform:\s+AWS::Serverless-2016-10-31/m],
  ["worker TypeScript entry point", /BuildMethod:\s+esbuild[\s\S]*EntryPoints:\s*\[aws\/worker\.ts\]/m],
  ["worker CodeUri", /CodeUri:\s+\.\.\//m],
  ["SQS event with partial failures", /Type:\s+SQS[\s\S]*FunctionResponseTypes:\s*\[ReportBatchItemFailures\]/m],
  ["queue redrive to DLQ", /RedrivePolicy:[\s\S]*deadLetterTargetArn:[\s\S]*RiskDeadLetterQueue\.Arn/m],
  ["bounded worker concurrency", /ReservedConcurrentExecutions:\s+\d+/m],
  ["SSM SecureString dynamic reference", /resolve:ssm-secure:/m],
  ["log retention", /RetentionInDays:\s+7/m],
  ["DLQ alarm", /RiskDeadLetterAlarm:[\s\S]*ApproximateNumberOfMessagesVisible/m],
];
const missing = assertions.filter(([, pattern]) => !pattern.test(source)).map(([label]) => label);
if (missing.length) throw new Error(`SAM template structural checks failed: ${missing.join(", ")}`);
console.log(`AWS SAM structural validation passed: ${assertions.length} queue, worker, security, build, retry, retention, and DLQ-alarm assertions.`);
