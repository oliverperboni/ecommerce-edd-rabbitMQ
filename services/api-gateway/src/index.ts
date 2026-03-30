import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const SERVICES: Record<string, string> = {
  orders: 'http://localhost:3001',
  inventory: 'http://localhost:3002',
}

const app = new Hono()

app.all('/api/:service/*', async (c) => {
  const service = c.req.param('service')
  const target = SERVICES[service]

  if (!target) {
    return c.json({ error: `Unknown service: ${service}` }, 404)
  }

  const rest = c.req.path.replace('/api', '')
  const url = `${target}${rest}${c.req.url.includes('?') ? '?' + c.req.url.split('?')[1] : ''}`

  try {
    const headers: Record<string, string> = {}
    c.req.raw.headers.forEach((value, key) => {
      if (key !== 'host') {
        headers[key] = value
      }
    })

    const body = c.req.method !== 'GET' && c.req.method !== 'HEAD'
      ? await c.req.text()
      : undefined

    const response = await fetch(url, {
      method: c.req.method,
      headers,
      body,
    })

    const contentType = response.headers.get('content-type') ?? 'application/json'
    const resBody = await response.text()

    return new Response(resBody, {
      status: response.status,
      headers: { 'content-type': contentType },
    })
  } catch (err) {
    console.error(`[gateway] Failed to reach ${service}:`, err)
    return c.json({ error: `Service "${service}" is unavailable` }, 502)
  }
})

app.get('/', (c) => {
  return c.json({
    message: 'API Gateway',
    services: Object.keys(SERVICES).map((s) => ({
      name: s,
      route: `/api/${s}/`,
      upstream: SERVICES[s],
    })),
  })
})

serve({
  fetch: app.fetch,
  port: 3000,
}, (info) => {
  console.log(`Gateway running on http://localhost:${info.port}`)
})
