import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

export interface QueuePublisher { publish(messageId: string, payload: Record<string, unknown>): Promise<void>; }

export class LocalQueuePublisher implements QueuePublisher {
  readonly messages: { messageId: string; payload: Record<string, unknown> }[] = [];
  async publish(messageId: string, payload: Record<string, unknown>) { this.messages.push({ messageId, payload }); }
}

export class SqsPublisher implements QueuePublisher {
  private readonly client: SQSClient;
  constructor(private readonly queueUrl: string, region = process.env.AWS_REGION || "ca-central-1") { this.client = new SQSClient({ region }); }
  async publish(messageId: string, payload: Record<string, unknown>) {
    await this.client.send(new SendMessageCommand({ QueueUrl: this.queueUrl, MessageBody: JSON.stringify({ ...payload, outboxEventId: messageId }) }));
  }
}

export function configuredPublisher() {
  if (!process.env.RISK_QUEUE_URL) throw new Error("RISK_QUEUE_URL is required for the durable dispatcher");
  return new SqsPublisher(process.env.RISK_QUEUE_URL);
}
