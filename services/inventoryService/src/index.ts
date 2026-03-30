import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createRabbitMQConnection, publishMessage, consumeMessages } from '@ecommerce/rabbitmq'

const app = new Hono()

type InventoryItem = {
  id: string
  name: string
  quantity: number
}

const inventory: InventoryItem[] = [
  { id: '1', name: 'Product A', quantity: 100 },
  { id: '2', name: 'Product B', quantity: 50 },
  { id: '3', name: 'Product C', quantity: 200 },
  { id: '4', name: 'Product D', quantity: 0 }
]

const { channel } = await createRabbitMQConnection();

await consumeMessages(
  channel,
  'inventory-service-order-events',
  ['order.placed', 'order.deleted'],
  async (routingKey, data) => {
    if (routingKey === 'order.placed') {
      const { id, product, quantity } = data as { id: string; product: string; quantity: number };
      const item = inventory.find(i => i.name === product);
      if (item && item.quantity >= quantity) {
        item.quantity -= quantity;
        publishMessage(channel, 'stock.reserved', { id: item.id, name: item.name, quantity: item.quantity });
        console.log(`[inventory-service] Reserved ${quantity} of ${product} for order ${id}`);
      } else {
        publishMessage(channel, 'stock.failed', { id: product, name: product, quantity: 0 });
        console.log(`[inventory-service] Stock failed for ${product}, order ${id}`);
      }
    } else if (routingKey === 'order.deleted') {
      const { id } = data as { id: string };
      console.log(`[inventory-service] Order ${id} deleted, stock released`);
      publishMessage(channel, 'stock.released', { orderId: id });
    }
  }
);

app.get('/inventory', (c) => {
  return c.json(inventory)
})

app.post('/inventory', async (c) => {
  const { id, name, quantity } = await c.req.json()
  const newItem: InventoryItem = { id, name, quantity }
  if (inventory.find(item => item.id === id)) {
    publishMessage(channel, 'stock.failed', newItem);
    return c.text(`Inventory item with id ${id} already exists`, 400)
  }
  inventory.push(newItem)
  publishMessage(channel, 'stock.reserved', newItem);
  return c.json(newItem, 201)
})

app.get('/inventory/:id', (c) => {
  const { id } = c.req.param()
  const item = inventory.find(item => item.id === id)
  if (item) {
    return c.json(item)
  }
  return c.text(`Inventory item with id ${id} not found`, 404)
})

app.put('/inventory/:id', async (c) => {
  const { id } = c.req.param()
  const { name, quantity } = await c.req.json()
  const item = inventory.find(item => item.id === id)
  if (item) {
    item.name = name
    item.quantity = quantity
    publishMessage(channel, 'stock.updated', item);
    return c.json(item)
  }
  return c.text(`Inventory item with id ${id} not found`, 404)
})

app.delete('/inventory/:id', (c) => {
  const { id } = c.req.param()
  const index = inventory.findIndex(item => item.id === id)
  if (index !== -1) {
    const deletedItem = inventory.splice(index, 1)[0]
    publishMessage(channel, 'stock.released', deletedItem);
    return c.text(`Inventory item with id ${id} deleted`)
  }
  return c.text(`Inventory item with id ${id} not found`, 404)
})

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

serve({
  fetch: app.fetch,
  port: 3002
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
