# Prisma + PostgreSQL Migration - Complete!

## Summary

✅ Successfully migrated from in-memory arrays to PostgreSQL with Prisma ORM!

### What Was Changed

| Component | Before | After |
|-----------|--------|-------|
| **Order Service** | In-memory `orders[]` array | PostgreSQL database with Prisma |
| **Inventory Service** | In-memory `inventory[]` array | PostgreSQL database with Prisma |
| **Data Persistence** | ❌ Lost on restart | ✅ Persisted in PostgreSQL |
| **IDs** | Manual string IDs | Auto-generated UUIDs |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Containers                        │
├──────────────────────┬──────────────────────┬───────────────────┤
│  PostgreSQL          │  PostgreSQL          │  RabbitMQ         │
│  (orders_db)         │  (inventory_db)      │                   │
│  Port: 5432          │  Port: 5433          │  Port: 5672/15672 │
└──────────────────────┴──────────────────────┴───────────────────┘
           │                         │
           ▼                         ▼
┌──────────────────┐         ┌──────────────────┐
│  Order Service   │◄───────►│ Inventory Service│
│  Port: 3001      │  Rabbit │  Port: 3002      │
│  @prisma/client  │  Events │  @prisma/client  │
└──────────────────┘         └──────────────────┘
```

---

## Database Schema

### Order Service (orders_db)
```prisma
model Order {
  id        String   @id @default(uuid())
  product   String
  quantity  Int
  status    String?  // 'stock-reserved', 'stock-failed'
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Inventory Service (inventory_db)
```prisma
model InventoryItem {
  id        String   @id @default(uuid())
  name      String
  quantity  Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## Quick Start

### 1. Start Infrastructure

```bash
docker-compose up -d
```

This starts:
- PostgreSQL for orders (port 5432)
- PostgreSQL for inventory (port 5433)
- RabbitMQ (port 5672 / management UI on 15672)

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Verify Databases

Check containers are running:
```bash
docker-compose ps
```

Expected output:
```
NAME                           STATUS                    PORTS
ecommerce-postgres-orders      Up (healthy)              0.0.0.0:5432->5432/tcp
ecommerce-postgres-inventory   Up (healthy)              0.0.0.0:5433->5432/tcp
ecommerce-rabbitmq             Up (healthy)              0.0.0.0:5672->5672, 0.0.0.0:15672->15672/tcp
```

### 4. Seed Inventory Data (already done)

The 4 initial products have been migrated to the database:
- Product A: 100 units
- Product B: 50 units
- Product C: 200 units
- Product D: 0 units

```bash
cd services/inventoryService
npx tsx prisma/seed.ts
```

### 5. Start Services

```bash
# Option 1: Start all services
pnpm dev

# Option 2: Start individual services
cd services/order-service && pnpm dev
cd services/inventoryService && pnpm dev
cd services/api-gateway && pnpm dev
```

---

## Development Commands

### Order Service

```bash
cd services/order-service

# Generate Prisma Client
npx prisma generate

# Create migration
npx prisma migrate dev --name <migration_name>

# Open Prisma Studio (GUI)
npx prisma studio

# Reset database (development only)
npx prisma migrate reset
```

### Inventory Service

```bash
cd services/inventoryService

# Generate Prisma Client
npx prisma generate

# Create migration
npx prisma migrate dev --name <migration_name>

# Open Prisma Studio (GUI on port 5555)
npx prisma studio

# Seed database
npx tsx prisma/seed.ts

# Reset database (development only)
npx prisma migrate reset
```

---

## Database Connections

### Order Service
- **Database**: `orders_db`
- **URL**: `postgresql://orders_user:orders_password@localhost:5432/orders_db`
- **File**: `services/order-service/.env`

### Inventory Service
- **Database**: `inventory_db`
- **URL**: `postgresql://inventory_user:inventory_password@localhost:5433/inventory_db`
- **File**: `services/inventoryService/.env`

---

## Project Structure

```
/Users/oliverperboni/Desktop/dev/ecommerce-edd-rabbitMQ/
├── docker-compose.yml              # Infrastructure (Postgres x2, RabbitMQ)
├── packages/
│   └── prisma/                     # Shared Prisma utilities
│       ├── src/index.ts            # Helper functions
│       ├── package.json
│       └── tsconfig.json
├── services/
│   ├── order-service/
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # Order model
│   │   │   ├── generated/client/   # Generated Prisma Client
│   │   │   └── migrations/         # Database migrations
│   │   ├── src/index.ts            # Refactored with Prisma
│   │   └── .env                    # DATABASE_URL
│   └── inventoryService/
│       ├── prisma/
│       │   ├── schema.prisma       # InventoryItem model
│       │   ├── generated/client/   # Generated Prisma Client
│       │   ├── migrations/         # Database migrations
│       │   └── seed.ts             # Initial data seed
│       ├── src/index.ts            # Refactored with Prisma
│       └── .env                    # DATABASE_URL
```

---

## Testing the Flow

### 1. Create an Inventory Item

```bash
curl -X POST http://localhost:3000/api/inventory \
  -H 'Content-Type: application/json' \
  -d '{"name":"Widget","quantity":50}'
```

### 2. Place an Order

```bash
curl -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"product":"Widget","quantity":5,"id":"order-001"}'
```

### 3. Verify Data Persistence

The order and updated inventory are now stored in PostgreSQL and will survive service restarts!

```bash
# Check orders
curl http://localhost:3000/api/orders

# Check inventory (should show Widget with 45 units)
curl http://localhost:3000/api/inventory
```

### 4. Verify with Prisma Studio

```bash
# Order Service
cd services/order-service && npx prisma studio
# Opens on http://localhost:5555

# Inventory Service
cd services/inventoryService && npx prisma studio
# Opens on http://localhost:5556
```

---

## Key Changes Made

### 1. Infrastructure (docker-compose.yml)
- Added PostgreSQL container for orders (port 5432)
- Added PostgreSQL container for inventory (port 5433)
- Both with health checks and persistent volumes

### 2. Order Service
- ✅ Created `prisma/schema.prisma` with `Order` model
- ✅ Created `.env` with `DATABASE_URL`
- ✅ Added Prisma dependencies to `package.json`
- ✅ Refactored `src/index.ts`:
  - Replaced `orders[]` array with `prisma.order` queries
  - All CRUD operations now use database
  - RabbitMQ consumer updates database on stock events
  - Added graceful shutdown with `prisma.$disconnect()`

### 3. Inventory Service
- ✅ Created `prisma/schema.prisma` with `InventoryItem` model
- ✅ Created `.env` with `DATABASE_URL`
- ✅ Added Prisma dependencies to `package.json`
- ✅ Created `prisma/seed.ts` to migrate initial 4 products
- ✅ Refactored `src/index.ts`:
  - Replaced `inventory[]` array with `prisma.inventoryItem` queries
  - All CRUD operations now use database
  - RabbitMQ consumer queries/updates database on order events
  - Stock reservation updates database atomically
  - Added graceful shutdown

### 4. Shared Package (@ecommerce/prisma)
- Created helper utilities for Prisma configuration
- Provides `createPrismaConfig()` and `getDatabaseUrl()` functions
- Can be extended with more shared utilities

---

## Benefits of This Migration

✅ **Data Persistence**: Data survives service restarts
✅ **Scalability**: Can run multiple service instances
✅ **ACID Compliance**: Database transactions ensure data integrity
✅ **Query Power**: Full SQL query capabilities via Prisma
✅ **Type Safety**: Full TypeScript support with generated types
✅ **Migrations**: Schema changes tracked in version control
✅ **Observability**: Prisma Studio for database inspection

---

## Troubleshooting

### Prisma Client not found
```bash
# Regenerate the client
cd services/<service-name>
npx prisma generate
```

### Database connection failed
```bash
# Check if containers are running
docker-compose ps

# Restart containers
docker-compose restart

# View logs
docker-compose logs postgres-orders
docker-compose logs postgres-inventory
```

### Migration issues
```bash
# Reset database (WARNING: deletes all data)
cd services/<service-name>
npx prisma migrate reset

# Or create a new migration
npx prisma migrate dev --name fix_something
```

---

## Next Steps

1. **Add Indexes**: Add database indexes for frequently queried fields
2. **Add Relations**: Consider adding relations between orders and inventory
3. **Soft Deletes**: Add `deletedAt` fields for soft delete functionality
4. **Audit Logs**: Track who created/updated records
5. **Connection Pooling**: Configure Prisma connection pool for production
6. **Database Backups**: Set up automated backups for PostgreSQL

---

## Migration Complete! 🎉

Your e-commerce microservices now use PostgreSQL with Prisma ORM for data persistence, following microservices best practices with separate databases per service.
