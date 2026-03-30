# API Testing Guide

Start all services first:
```bash
pnpm dev
```

---

## 1. Gateway Health Check

```bash
curl http://localhost:3000/
```

---

## 2. Inventory Service

### 2.1 Add items to inventory

```bash
curl -X POST http://localhost:3000/api/inventory \
  -H 'Content-Type: application/json' \
  -d '{"id":"inv-1","name":"widget","quantity":10}'

curl -X POST http://localhost:3000/api/inventory \
  -H 'Content-Type: application/json' \
  -d '{"id":"inv-2","name":"gadget","quantity":5}'
```

### 2.2 List inventory

```bash
curl http://localhost:3000/api/inventory
```

### 2.3 Get single item

```bash
curl http://localhost:3000/api/inventory/inv-1
```

### 2.4 Update item

```bash
curl -X PUT http://localhost:3000/api/inventory/inv-1 \
  -H 'Content-Type: application/json' \
  -d '{"name":"widget","quantity":20}'
```

### 2.5 Delete item

```bash
curl -X DELETE http://localhost:3000/api/inventory/inv-2
```

---

## 3. Order Service

### 3.1 Place an order

```bash
curl -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"id":"ord-1","product":"widget","quantity":3}'
```

> Check inventoryService logs — it should receive `order.placed`, decrement stock, and publish `stock.reserved`.
> Check orderService logs — it should receive `stock.reserved` and set order status to `"stock-reserved"`.

### 3.2 Verify order status was updated by consumer

```bash
curl http://localhost:3000/api/orders/ord-1
```

Expected: `"status":"stock-reserved"`

### 3.3 Place an order for an unknown product (triggers stock.failed)

```bash
curl -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"id":"ord-2","product":"unknown-item","quantity":1}'
```

### 3.4 Verify failed order status

```bash
curl http://localhost:3000/api/orders/ord-2
```

Expected: `"status":"stock-failed"`

### 3.5 List all orders

```bash
curl http://localhost:3000/api/orders
```

### 3.6 Get single order

```bash
curl http://localhost:3000/api/orders/ord-1
```

### 3.7 Update order

```bash
curl -X PUT http://localhost:3000/api/orders/ord-1 \
  -H 'Content-Type: application/json' \
  -d '{"product":"widget","quantity":5,"status":"updated-manually"}'
```

### 3.8 Delete an order (triggers order.deleted)

```bash
curl -X DELETE http://localhost:3000/api/orders/ord-1
```

> Check inventoryService logs — it should receive `order.deleted` and publish `stock.released`.

---

## 4. Full End-to-End Flow

Run this sequence to test the complete pub/sub cycle:

```bash
# 1. Add stock
curl -X POST http://localhost:3000/api/inventory \
  -H 'Content-Type: application/json' \
  -d '{"id":"e2e-1","name":"e2e-product","quantity":10}'

# 2. Place order (should trigger stock reservation)
curl -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"id":"e2e-ord-1","product":"e2e-product","quantity":2}'

# 3. Wait a moment for message propagation, then verify order status
sleep 1
curl http://localhost:3000/api/orders/e2e-ord-1

# 4. Verify inventory was decremented
curl http://localhost:3000/api/inventory/e2e-1

# 5. Delete order (should trigger stock release)
curl -X DELETE http://localhost:3000/api/orders/e2e-ord-1

# 6. Wait and check logs for stock.released
sleep 1
```

---

## 5. Error Handling

### 5.1 Unknown service via gateway

```bash
curl http://localhost:3000/api/unknown
```

Expected: `404` with `{"error":"Unknown service: unknown"}`

### 5.2 Non-existent order

```bash
curl http://localhost:3000/api/orders/nonexistent
```

Expected: `404`

### 5.3 Non-existent inventory item

```bash
curl http://localhost:3000/api/inventory/nonexistent
```

Expected: `404`

### 5.4 Duplicate inventory item

```bash
# First create
curl -X POST http://localhost:3000/api/inventory \
  -H 'Content-Type: application/json' \
  -d '{"id":"dup-1","name":"duplicate","quantity":1}'

# Duplicate attempt
curl -X POST http://localhost:3000/api/inventory \
  -H 'Content-Type: application/json' \
  -d '{"id":"dup-1","name":"duplicate","quantity":1}'
```

Expected second call: `400` with `"Inventory item with id dup-1 already exists"`
