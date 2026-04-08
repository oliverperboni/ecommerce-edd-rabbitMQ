# Agent Instructions

## Project Overview

E-commerce microservices demo with RabbitMQ event-driven architecture. Uses pnpm workspaces with three services and two shared packages.

## Quick Start

```bash
# 1. Start infrastructure (Postgres x2, RabbitMQ)
docker-compose up -d

# 2. Install dependencies
pnpm install

# 3. Run database migrations (each service manages its own DB)
cd services/order-service && npx prisma migrate dev
cd services/inventoryService && npx prisma migrate dev

# 4. Start all services
pnpm dev
```

Gateway runs on http://localhost:3000. Services: order-service (3001), inventoryService (3002). RabbitMQ Management: http://localhost:15672 (admin/admin).

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌──────────────────┐
│  API Gateway │──────│ order-service│◄────►│  postgres-orders │
│   (3000)     │      │   (3001)     │      │     (5432)       │
└─────────────┘      └──────┬───────┘      └──────────────────┘
                            │
                    RabbitMQ│(5672)
                    (topic_orders)
                            │
                     ┌──────▼───────┐      ┌──────────────────┐
                     │inventoryService│◄────►│postgres-inventory│
                     │   (3002)      │      │    (5433)        │
                     └───────────────┘      └──────────────────┘
```

### Message Flow

- `order.placed` → inventoryService reserves stock → `stock.reserved`/`stock.failed`
- `order.deleted` → inventoryService releases stock → `stock.released`

## Monorepo Structure

```
packages/
  @ecommerce/rabbitmq    # Shared amqplib wrapper (topic exchange, pub/sub)
  @ecommerce/prisma      # Prisma config helpers (not the client)
services/
  api-gateway            # Hono proxy, no DB, port 3000
  order-service          # Hono + Prisma, own schema, port 3001
  inventoryService       # Hono + Prisma, own schema, port 3002
```

Each service has its own:
- `prisma/schema.prisma` (service-specific models)
- `.env` with DATABASE_URL pointing to different Postgres ports (5432 vs 5433)
- Prisma client generated from `@prisma/client` (not from packages/prisma)

## Common Tasks

### Run single service
```bash
cd services/order-service && pnpm dev
```

### Prisma operations (per-service)
```bash
cd services/order-service
npx prisma generate      # After schema changes
npx prisma migrate dev   # Create/apply migrations
npx prisma studio        # GUI on port 5555
```

### Test via gateway
```bash
# Health check
curl http://localhost:3000/

# Create inventory
curl -X POST http://localhost:3000/api/inventory \
  -H 'Content-Type: application/json' \
  -d '{"name":"widget","quantity":10}'

# Place order (triggers stock reservation flow)
curl -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"product":"widget","quantity":3}'
```

See `TESTING.md` for full API test suite.

## Critical Conventions

- **ESM only**: All packages use `"type": "module"`
- **Dev runtime**: `tsx watch` for hot reload (not ts-node)
- **No root tests**: Each service manages its own testing
- **Prisma pattern**: Each service owns its schema; `packages/prisma` only provides config helpers
- **RabbitMQ exchange**: Hardcoded as `'topic_orders'` in `@ecommerce/rabbitmq`
- **Workspace deps**: Use `"workspace:*"` for internal packages

## Ports & Credentials

| Service | Port | Notes |
|---------|------|-------|
| API Gateway | 3000 | Proxy to /api/orders, /api/inventory |
| order-service | 3001 | Direct access possible but use gateway |
| inventoryService | 3002 | Direct access possible but use gateway |
| postgres-orders | 5432 | orders_user / orders_password |
| postgres-inventory | 5433 | inventory_user / inventory_password |
| RabbitMQ AMQP | 5672 | admin / admin |
| RabbitMQ Mgmt | 15672 | admin / admin |

## Environment Files

Each service needs its own `.env`:
- `services/order-service/.env` → DATABASE_URL uses port 5432
- `services/inventoryService/.env` → DATABASE_URL uses port 5433

Both use `RABBITMQ_URL="amqp://admin:admin@localhost:5672"`

## Troubleshooting

- **Migration conflicts**: Each service has isolated DB, but `prisma migrate dev` prompts for shadow database if parallel
- **Port already in use**: Check `docker ps` for existing containers
- **Module resolution**: Ensure `pnpm install` at root; workspace links rely on it
