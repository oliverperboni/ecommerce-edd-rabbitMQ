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
    databaseUrl: string;
    environment?: 'development' | 'production' | 'test';
}
/**
 * Creates Prisma client options
 */
export declare function createPrismaConfig({ databaseUrl, environment }: PrismaConfig): {
    datasources: {
        db: {
            url: string;
        };
    };
    log: readonly ["query", "info", "warn", "error"] | readonly ["error"];
};
/**
 * Helper to get database URL from environment
 */
export declare function getDatabaseUrl(): string;
/**
 * Helper to check if running in development
 */
export declare function isDevelopment(): boolean;
//# sourceMappingURL=index.d.ts.map