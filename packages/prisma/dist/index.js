"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPrismaConfig = createPrismaConfig;
exports.getDatabaseUrl = getDatabaseUrl;
exports.isDevelopment = isDevelopment;
/**
 * Creates Prisma client options
 */
function createPrismaConfig({ databaseUrl, environment = 'development' }) {
    return {
        datasources: {
            db: {
                url: databaseUrl,
            },
        },
        log: environment === 'development'
            ? ['query', 'info', 'warn', 'error']
            : ['error'],
    };
}
/**
 * Helper to get database URL from environment
 */
function getDatabaseUrl() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error('DATABASE_URL environment variable is required');
    }
    return url;
}
/**
 * Helper to check if running in development
 */
function isDevelopment() {
    return process.env.NODE_ENV !== 'production';
}
//# sourceMappingURL=index.js.map