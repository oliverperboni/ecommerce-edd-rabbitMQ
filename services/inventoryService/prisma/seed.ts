import { PrismaClient } from './generated/client/index.js'

const prisma = new PrismaClient()

async function main() {
  console.log('[inventory-service] Starting database seed...')

  // Initial inventory items (migrated from local arrays)
  const initialItems = [
    { name: 'Product A', quantity: 100 },
    { name: 'Product B', quantity: 50 },
    { name: 'Product C', quantity: 200 },
    { name: 'Product D', quantity: 0 }
  ]

  for (const item of initialItems) {
    // Check if item already exists
    const existing = await prisma.inventoryItem.findFirst({
      where: { name: item.name }
    })

    if (!existing) {
      await prisma.inventoryItem.create({
        data: item
      })
      console.log(`[inventory-service] Created: ${item.name} (${item.quantity} units)`)
    } else {
      console.log(`[inventory-service] Skipped (already exists): ${item.name}`)
    }
  }

  console.log('[inventory-service] Database seed completed!')
}

main()
  .catch((e) => {
    console.error('[inventory-service] Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
