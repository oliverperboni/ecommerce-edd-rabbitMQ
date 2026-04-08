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
  'inventory-service-order-events',
  ['order.placed', 'order.deleted'],
  async (routingKey, data) => {
    if (routingKey === 'order.placed') {
      const { id, product, quantity } = data as { id: string; product: string; quantity: number };
      
      // Find product in database
      const item = await prisma.inventoryItem.findFirst({
        where: { name: product }
      });
      
      if (item && item.quantity >= quantity) {
        // Reserve stock by updating quantity
        const updatedItem = await prisma.inventoryItem.update({
          where: { id: item.id },
          data: { quantity: item.quantity - quantity }
        });
        
        publishMessage(channel, 'stock.reserved', { 
          orderId: id,
          id: updatedItem.id, 
          name: updatedItem.name, 
          quantity: updatedItem.quantity 
        });
        console.log(`[inventory-service] Reserved ${quantity} of ${product} for order ${id}`);
      } else {
        publishMessage(channel, 'stock.failed', { 
          orderId: id,
          id: product, 
          name: product, 
          quantity: 0,
          reason: item ? 'Insufficient stock' : 'Product not found'
        });
        console.log(`[inventory-service] Stock failed for ${product}, order ${id}`);
      }
    } else if (routingKey === 'order.deleted') {
      const { id } = data as { id: string };
      
      // Note: In a real system, you'd need to track reserved stock to release it properly
      // For now, we just log and publish the event
      console.log(`[inventory-service] Order ${id} deleted, stock released`);
      publishMessage(channel, 'stock.released', { orderId: id });
    }
  }
);

app.get('/inventory', async (c) => {
  const inventory = await prisma.inventoryItem.findMany({
    orderBy: { createdAt: 'desc' }
  });
  return c.json(inventory);
});

app.get('/inventory/:id', async (c) => {
  const { id } = c.req.param();
  const item = await prisma.inventoryItem.findUnique({
    where: { id }
  });
  
  if (item) {
    return c.json(item);
  }
  return c.text(`Inventory item with id ${id} not found`, 404);
});

app.post('/inventory', async (c) => {
  const { name, quantity } = await c.req.json();
  
  // Check if item with same name already exists
  const existing = await prisma.inventoryItem.findFirst({
    where: { name }
  });
  
  if (existing) {
    publishMessage(channel, 'stock.failed', { name, reason: 'Item already exists' });
    return c.text(`Inventory item with name '${name}' already exists`, 400);
  }
  
  const newItem = await prisma.inventoryItem.create({
    data: { name, quantity }
  });
  
  publishMessage(channel, 'stock.created', newItem);
  return c.json(newItem, 201);
});

app.put('/inventory/:id', async (c) => {
  const { id } = c.req.param();
  const { name, quantity } = await c.req.json();
  
  try {
    const updatedItem = await prisma.inventoryItem.update({
      where: { id },
      data: { name, quantity }
    });
    
    publishMessage(channel, 'stock.updated', updatedItem);
    return c.json(updatedItem);
  } catch (error) {
    return c.text(`Inventory item with id ${id} not found`, 404);
  }
});

app.delete('/inventory/:id', async (c) => {
  const { id } = c.req.param();
  
  try {
    const deletedItem = await prisma.inventoryItem.delete({
      where: { id }
    });
    
    publishMessage(channel, 'stock.released', deletedItem);
    return c.text(`Inventory item with id ${id} deleted`);
  } catch (error) {
    return c.text(`Inventory item with id ${id} not found`, 404);
  }
});

app.get('/', (c) => {
  return c.json({
    message: 'Inventory Service',
    database: 'PostgreSQL',
    status: 'running'
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[inventory-service] Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[inventory-service] Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3002;

serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`[inventory-service] Server is running on http://localhost:${info.port}`);
  console.log(`[inventory-service] Database: PostgreSQL (inventory_db)`);
});
