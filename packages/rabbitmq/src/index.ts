import amqplib from 'amqplib';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';

const EXCHANGE = 'topic_orders';

export type RabbitMQContext = {
  connection: ChannelModel;
  channel: Channel;
}

export async function createRabbitMQConnection(url = 'amqp://localhost'): Promise<RabbitMQContext> {
  const connection = await amqplib.connect(url);
  const channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE, 'topic', { durable: false });

  connection.on('error', (err) => {
    console.error('[RabbitMQ] Connection error:', err.message);
  });

  channel.on('error', (err) => {
    console.error('[RabbitMQ] Channel error:', err.message);
  });

  console.log('[RabbitMQ] Connected');
  return { connection, channel };
}

export function publishMessage(channel: Channel, routingKey: string, payload: unknown): void {
  const message = Buffer.from(JSON.stringify(payload));
  channel.publish(EXCHANGE, routingKey, message);
  console.log(`[RabbitMQ] Published ${routingKey}:`, payload);
}

export async function consumeMessages(
  channel: Channel,
  queueName: string,
  bindingKeys: string[],
  handler: (routingKey: string, data: unknown, msg: ConsumeMessage) => Promise<void>
): Promise<void> {
  await channel.assertQueue(queueName, { durable: false });

  for (const key of bindingKeys) {
    await channel.bindQueue(queueName, EXCHANGE, key);
  }

  await channel.consume(queueName, async (msg) => {
    if (!msg) return;
    const routingKey = msg.fields.routingKey;
    try {
      const data = JSON.parse(msg.content.toString());
      await handler(routingKey, data, msg);
      channel.ack(msg);
    } catch (err) {
      console.error(`[RabbitMQ] Error processing ${routingKey}:`, err);
      channel.nack(msg, false, false);
    }
  });

  console.log(`[RabbitMQ] Consuming queue "${queueName}" bound to: ${bindingKeys.join(', ')}`);
}
