# @ecommerce/prisma

Shared Prisma utilities for the e-commerce microservices.

## Usage

Each service creates its own Prisma client with its database URL:

```typescript
import { createPrismaClient } from '@ecommerce/prisma'

const prisma = createPrismaClient({ 
  databaseUrl: process.env.DATABASE_URL 
})
```

## Each service requirements

Each service needs its own:
1. `prisma/schema.prisma` - Define service-specific models
2. `prisma/migrations/` - Service-specific migrations
3. `.env` file with `DATABASE_URL`

## Prisma Commands

Run these from within each service directory:

```bash
# Generate Prisma Client
npx prisma generate

# Create migration
npx prisma migrate dev --name init

# Deploy migrations
npx prisma migrate deploy

# Reset database (dev only)
npx prisma migrate reset

# Open Prisma Studio
npx prisma studio
```
