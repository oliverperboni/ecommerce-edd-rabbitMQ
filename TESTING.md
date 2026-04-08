# API Testing Guide

> **Updated for Prisma + PostgreSQL**
> 
> This guide has been updated to reflect the migration from in-memory arrays to PostgreSQL with Prisma ORM.
> - Inventory and Order IDs are now auto-generated UUIDs
> - Data persists across service restarts
> - 4 products (Product A-D) are pre-seeded in the inventory database

## Prerequisites

Start all services and infrastructure:

```bash
# 1. Start databases and RabbitMQ
docker-compose up -d

# 2. Verify containers are running
docker-compose ps

# 3. Install dependencies (if not done)
pnpm install

# 4. Start all services
pnpm dev
```

### Verify Infrastructure

```bash
# Check PostgreSQL for orders (port 5432)
docker-compose exec postgres-orders pg_isready -U orders_user

# Check PostgreSQL for inventory (port 5433)
docker-compose exec postgres-inventory pg_isready -U inventory_user

# Check RabbitMQ Management UI
open http://localhost:15672  # admin/admin
```

---

## 1. Gateway Health Check

```bash
curl http://localhost:3000/
```

**Expected:** `{"message":"API Gateway","services":["orders","inventory"],"status":"running"}`

---

## 2. Inventory Service

### 2.1 View Pre-seeded Inventory

The database comes with 4 pre-seeded products:

```bash
curl http://localhost:3000/api/inventory
```

**Expected:** Array with Product A (100), Product B (50), Product C (200), Product D (0)

### 2.2 Add new item to inventory

> **Note:** ID is now auto-generated as UUID. Only provide `name` and `quantity`.

```bash
curl -X POST http://localhost:3000/api/inventory \
  -H 'Content-Type: application/json' \
  -d '{"name":"widget","quantity":10}'
```

**Expected:** `{"id":"auto-generated-uuid","name":"widget","quantity":10,"createdAt":"...","updatedAt":"..."}`

Save the returned `id` for subsequent operations.

### 2.3 Add another item

```bash
curl -X POST http://localhost:3000/api/inventory \
  -H 'Content-Type: application/json' \
  -d '{"name":"gadget","quantity":5}'
```

### 2.4 List all inventory

```bash
curl http://localhost:3000/api/inventory
```

### 2.5 Get single item

Replace `<uuid>` with the actual ID from the create response:

```bash
curl http://localhost:3000/api/inventory/<uuid>
```

### 2.6 Update item

```bash
curl -X PUT http://localhost:3000/api/inventory/<uuid> \
  -H 'Content-Type: application/json' \
  -d '{"name":"widget","quantity":20}'
```

### 2.7 Delete item

```bash
curl -X DELETE http://localhost:3000/api/inventory/<uuid>
```

---

## 3. Order Service

### 3.1 Place an order for a pre-seeded product

> **Note:** ID is now auto-generated as UUID. Only provide `product` name and `quantity`.

```bash
curl -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"product":"Product A","quantity":3}'
```

**Expected:** `{"id":"auto-generated-uuid","product":"Product A","quantity":3,"status":null,"createdAt":"...","updatedAt":"..."}`

> Check terminal logs:
> - `inventoryService` should receive `order.placed`, decrement stock, and publish `stock.reserved`
> - `orderService` should receive `stock.reserved` and update order status to `"stock-reserved"`

Save the returned `id` for verification.

### 3.2 Verify order status was updated by consumer

Replace `<order-uuid>` with the actual order ID:

```bash
curl http://localhost:3000/api/orders/<order-uuid>
```

**Expected:** `"status":"stock-reserved"` and inventory for Product A decremented by 3

### 3.3 Verify inventory was decremented

```bash
curl http://localhost:3000/api/inventory
```

Product A should now show 97 units (was 100, minus 3 ordered).

### 3.4 Place an order for an unknown product (triggers stock.failed)

```bash
curl -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"product":"unknown-item","quantity":1}'
```

### 3.5 Verify failed order status

Replace `<failed-order-uuid>` with the ID from the previous response:

```bash
curl http://localhost:3000/api/orders/<failed-order-uuid>
```

**Expected:** `"status":"stock-failed"`

### 3.6 Place an order exceeding stock (triggers stock.failed)

```bash
curl -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"product":"Product D","quantity":5}'
```

Product D has 0 quantity, so this should fail.

### 3.7 List all orders

```bash
curl http://localhost:3000/api/orders
```

### 3.8 Get single order

```bash
curl http://localhost:3000/api/orders/<order-uuid>
```

### 3.9 Update order

```bash
curl -X PUT http://localhost:3000/api/orders/<order-uuid> \
  -H 'Content-Type: application/json' \
  -d '{"product":"Product B","quantity":5,"status":"updated-manually"}'
```

### 3.10 Delete an order (triggers order.deleted)

```bash
curl -X DELETE http://localhost:3000/api/orders/<order-uuid>
```

> Check `inventoryService` logs — it should receive `order.deleted` and publish `stock.released`.

---

## 4. Full End-to-End Flow

Run this sequence to test the complete pub/sub cycle with database persistence:

```bash
# 1. Check initial inventory
echo "=== Initial Inventory ==="
curl -s http://localhost:3000/api/inventory | jq '.[] | select(.name == "Product A")'

# 2. Place order (should trigger stock reservation)
echo "\n=== Placing Order ==="
ORDER_RESPONSE=$(curl -s -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"product":"Product A","quantity":2}')
echo $ORDER_RESPONSE | jq
ORDER_ID=$(echo $ORDER_RESPONSE | jq -r '.id')

# 3. Wait for message propagation, then verify order status
echo "\n=== Order Status (after 2s) ==="
sleep 2
curl -s http://localhost:3000/api/orders/$ORDER_ID | jq

# 4. Verify inventory was decremented
echo "\n=== Inventory After Order ==="
curl -s http://localhost:3000/api/inventory | jq '.[] | select(.name == "Product A")'

# 5. Delete order (should trigger stock release)
echo "\n=== Deleting Order ==="
curl -s -X DELETE http://localhost:3000/api/orders/$ORDER_ID

# 6. List all orders to confirm deletion
echo "\n=== Remaining Orders ==="
curl -s http://localhost:3000/api/orders | jq
```

### Verify Data Persistence

Restart the services and verify data is still there:

```bash
# Stop services (Ctrl+C in terminal running `pnpm dev`)
# Then restart
pnpm dev

# Check if inventory data persisted
curl http://localhost:3000/api/inventory

# Products A-D should still be there!
```

---

## 5. Database Inspection with Prisma Studio

### Order Service Database

```bash
cd services/order-service
npx prisma studio
# Opens on http://localhost:5555
```

### Inventory Service Database

```bash
cd services/inventoryService
npx prisma studio
# Opens on http://localhost:5556
```

Use Prisma Studio to:
- Browse all records
- Edit data directly
- Run ad-hoc queries
- Verify data integrity

---

## 6. Error Handling

### 6.1 Unknown service via gateway

```bash
curl http://localhost:3000/api/unknown
```

**Expected:** `404` with `{"error":"Unknown service: unknown"}`

### 6.2 Non-existent order

```bash
curl http://localhost:3000/api/orders/550e8400-e29b-41d4-a716-446655440000
```

**Expected:** `404` with `Order with id ... not found`

### 6.3 Non-existent inventory item

```bash
curl http://localhost:3000/api/inventory/550e8400-e29b-41d4-a716-446655440000
```

**Expected:** `404` with `Inventory item with id ... not found`

### 6.4 Duplicate inventory item name

```bash
# First create
curl -X POST http://localhost:3000/api/inventory \
  -H 'Content-Type: application/json' \
  -d '{"name":"unique-product","quantity":1}'

# Duplicate attempt (same name)
curl -X POST http://localhost:3000/api/inventory \
  -H 'Content-Type: application/json' \
  -d '{"name":"unique-product","quantity":5}'
```

**Expected second call:** `400` with `Inventory item with name 'unique-product' already exists`

### 6.5 Invalid JSON

```bash
curl -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"invalid"}'
```

**Expected:** `400` Bad Request

---

## 7. Performance & Load Testing

### Create multiple orders quickly

```bash
for i in {1..10}; do
  curl -s -X POST http://localhost:3000/api/orders \
    -H 'Content-Type: application/json' \
    -d "{\"product\":\"Product A\",\"quantity\":1}" > /dev/null
  echo "Order $i placed"
done

# Check final state
curl http://localhost:3000/api/orders
curl http://localhost:3000/api/inventory
```

### Verify concurrent order handling

Product A starts with 100 units. Place 50 orders of 2 units each:

```bash
for i in {1..50}; do
  curl -s -X POST http://localhost:3000/api/orders \
    -H 'Content-Type: application/json' \
    -d "{\"product\":\"Product A\",\"quantity\":2}" &
done
wait

# Check results
echo "=== Orders ==="
curl http://localhost:3000/api/orders | jq '. | length'

echo "=== Product A Stock ==="
curl -s http://localhost:3000/api/inventory | jq '.[] | select(.name == "Product A") | .quantity'
```

Expected: Some orders succeed, some fail when stock runs out.

---

## 8. Cleanup & Reset

### Reset Order Service Database

```bash
cd services/order-service
npx prisma migrate reset
# This deletes all orders and reapplies migrations
```

### Reset Inventory Service Database

```bash
cd services/inventoryService
npx prisma migrate reset
# This deletes all items and re-runs seed.ts (restores Product A-D)
```

### Full Cleanup (Docker)

```bash
# Stop and remove all containers
docker-compose down

# Remove volumes (WARNING: deletes all data)
docker-compose down -v

# Start fresh
docker-compose up -d
cd services/inventoryService && npx prisma migrate dev
```

---

## Summary of Changes from In-Memory Version

| Aspect | Before (Arrays) | After (Prisma + PostgreSQL) |
|--------|----------------|----------------------------|
| **Inventory IDs** | Manual (e.g., `"inv-1"`) | Auto-generated UUIDs |
| **Order IDs** | Manual (e.g., `"ord-1"`) | Auto-generated UUIDs |
| **Data Persistence** | ❌ Lost on restart | ✅ Persisted in PostgreSQL |
| **Initial Data** | Hardcoded in array | Seeded via `prisma/seed.ts` |
| **Duplicate Check** | By ID | By name (unique constraint) |
| **Query Features** | Basic array methods | Full SQL via Prisma |

---

## Troubleshooting

### "Cannot find module" errors

```bash
# Regenerate Prisma clients
cd services/order-service && npx prisma generate
cd services/inventoryService && npx prisma generate
```

### Database connection errors

```bash
# Check if containers are running
docker-compose ps

# Restart infrastructure
docker-compose restart

# View logs
docker-compose logs -f postgres-orders
docker-compose logs -f postgres-inventory
```

### Port already in use

```bash
# Find and kill processes using ports 3000-3002, 5432-5433
lsof -ti:3000,3001,3002,5432,5433 | xargs kill -9 2>/dev/null
```

### RabbitMQ connection errors

```bash
# Restart RabbitMQ
docker-compose restart rabbitmq

# Check RabbitMQ logs
docker-compose logs rabbitmq
```
