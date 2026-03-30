import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createRabbitMQConnection, publishMessage, consumeMessages } from '@ecommerce/rabbitmq'

type Order = {
  id: string
  product: string
  quantity: number
  status?: string
}

const orders: Order[] = []
const app = new Hono()

const { channel } = await createRabbitMQConnection();

await consumeMessages(
  channel,
  'order-service-stock-events',
  ['stock.reserved', 'stock.failed'],
  async (routingKey, data) => {
    const { id } = data as { id: string };
    const order = orders.find(o => o.id === id);
    if (!order) {
      console.log(`[order-service] No order found for id ${id}`);
      return;
    }
    if (routingKey === 'stock.reserved') {
      order.status = 'stock-reserved';
      console.log(`[order-service] Order ${id} stock reserved`);
    } else if (routingKey === 'stock.failed') {
      order.status = 'stock-failed';
      console.log(`[order-service] Order ${id} stock failed`);
    }
  }
);

app.get('/orders', (c) => {
  return c.json(orders)
})

app.delete('/orders/:id', (c) => {
  const { id } = c.req.param()
  const index = orders.findIndex(order => order.id === id)
  if (index !== -1) {
    orders.splice(index, 1)
    publishMessage(channel, 'order.deleted', { id });
    return c.text(`Order with id ${id} deleted`)
  }
  return c.text(`Order with id ${id} not found`, 404)
})

app.post('/orders', async (c) => {
  const { product, quantity, id } = await c.req.json()
  const newOrder: Order = { id, product, quantity }
  orders.push(newOrder)
  publishMessage(channel, 'order.placed', newOrder);
  return c.json(newOrder, 201)
})

app.get('/orders/:id', (c) => {
  const { id } = c.req.param()
  const order = orders.find(order => order.id === id)
  if (order) {
    return c.json(order)
  }
  return c.text(`Order with id ${id} not found`, 404)
})

app.put('/orders/:id', async (c) => {
  const { id } = c.req.param()
  const { product, quantity, status } = await c.req.json()
  const order = orders.find(order => order.id === id)
  if (order) {
    order.product = product
    order.quantity = quantity
    order.status = status
    return c.json(order)
  }
  return c.text(`Order with id ${id} not found`, 404)
})

serve({
  fetch: app.fetch,
  port: 3001
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
