/**
 * Shared Prisma utilities for e-commerce microservices
 * 
 * Each service should:
 * 1. Install @prisma/client and prisma
 * 2. Create prisma/schema.prisma with its models
 * 3. Run `prisma generate` to generate the client
 * 4. Import PrismaClient from '@prisma/client' (not from this package)
 * 
 * This package provides shared utilities and types.
 */

export interface PrismaConfig {
  databaseUrl: string
  environment?: 'development' | 'production' | 'test'
}

/**
 * Creates Prisma client options
 */
export function createPrismaConfig({ databaseUrl, environment = 'development' }: PrismaConfig) {
  return {
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: environment === 'development'
      ? (['query', 'info', 'warn', 'error'] as const)
      : (['error'] as const),
  }
}

/**
 * Helper to get database URL from environment
 */
export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL environment variable is required')
  }
  return url
}

/**
 * Helper to check if running in development
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production'
}
