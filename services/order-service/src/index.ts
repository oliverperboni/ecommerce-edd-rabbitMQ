import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { PrismaClient } from '../prisma/generated/client/index.js'
import { createRabbitMQConnection, publishMessage, consumeMessages } from '@ecommerce/rabbitmq'

const app = new Hono()

// Initialize Prisma Client
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error'] 
    : ['error'],
})

const { channel } = await createRabbitMQConnection(process.env.RABBITMQ_URL);

await consumeMessages(
  channel,
  'order-service-stock-events',
  ['stock.reserved', 'stock.failed'],
  async (routingKey, data) => {
    const { orderId } = data as { orderId: string };
    
    if (!orderId) {
      console.log('[order-service] No orderId in message');
      return;
    }
    
    // Find order in database
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });
    
    if (!order) {
      console.log(`[order-service] No order found for id ${orderId}`);
      return;
    }
    
    // Update order status based on stock event
    if (routingKey === 'stock.reserved') {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'stock-reserved' }
      });
      console.log(`[order-service] Order ${orderId} stock reserved`);
    } else if (routingKey === 'stock.failed') {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'stock-failed' }
      });
      console.log(`[order-service] Order ${orderId} stock failed`);
    }
  }
);

app.get('/orders', async (c) => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' }
  });
  return c.json(orders);
});

app.get('/orders/:id', async (c) => {
  const { id } = c.req.param();
  const order = await prisma.order.findUnique({
    where: { id }
  });
  
  if (order) {
    return c.json(order);
  }
  return c.text(`Order with id ${id} not found`, 404);
});

app.post('/orders', async (c) => {
  const { product, quantity, id } = await c.req.json();
  
  const newOrder = await prisma.order.create({
    data: {
      id,
      product,
      quantity,
    }
  });
  
  publishMessage(channel, 'order.placed', newOrder);
  return c.json(newOrder, 201);
});

app.put('/orders/:id', async (c) => {
  const { id } = c.req.param();
  const { product, quantity, status } = await c.req.json();
  
  try {
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        product,
        quantity,
        status,
      }
    });
    return c.json(updatedOrder);
  } catch (error) {
    return c.text(`Order with id ${id} not found`, 404);
  }
});

app.delete('/orders/:id', async (c) => {
  const { id } = c.req.param();
  
  try {
    await prisma.order.delete({
      where: { id }
    });
    
    publishMessage(channel, 'order.deleted', { id });
    return c.text(`Order with id ${id} deleted`);
  } catch (error) {
    return c.text(`Order with id ${id} not found`, 404);
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[order-service] Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[order-service] Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;

serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`[order-service] Server is running on http://localhost:${info.port}`);
  console.log(`[order-service] Database: PostgreSQL (orders_db)`);
});
