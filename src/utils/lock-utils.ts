import { logger } from './logger';

export class LockUtils {
    private locks: Map<string, { promise: Promise<any>; timestamp: number }> = new Map();
    private readonly DEFAULT_TIMEOUT = 30000;
    private readonly CLEANUP_INTERVAL = 60000;

    constructor() {
        setInterval(() => this.cleanupExpiredLocks(), this.CLEANUP_INTERVAL);
    }

    public async acquireLock<T>(
        key: string,
        operation: () => Promise<T>,
        timeoutMs: number = this.DEFAULT_TIMEOUT
    ): Promise<T> {
        this.cleanupExpiredLocks();

        const existingLock = this.locks.get(key);
        if (existingLock) {
            logger.debug(`Lock ${key} already exists, waiting...`);
            return existingLock.promise;
        }

        const lockPromise = this.executeWithTimeout(operation, timeoutMs, key)
            .finally(() => {
                this.locks.delete(key);
                logger.debug(`Lock ${key} released`);
            });

        this.locks.set(key, {
            promise: lockPromise,
            timestamp: Date.now()
        });

        logger.debug(`Lock ${key} acquired`);
        return lockPromise;
    }

    private async executeWithTimeout<T>(
        operation: () => Promise<T>,
        timeoutMs: number,
        key: string
    ): Promise<T> {
        return new Promise(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Operation timeout for lock ${key} after ${timeoutMs}ms`));
            }, timeoutMs);

            try {
                const result = await operation();
                clearTimeout(timeoutId);
                resolve(result);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    private cleanupExpiredLocks(): void {
        const now = Date.now();
        for (const [key, lock] of this.locks.entries()) {
            if (now - lock.timestamp > this.DEFAULT_TIMEOUT + 10000) {
                logger.warn(`Cleaning up expired lock: ${key}`);
                this.locks.delete(key);
            }
        }
    }

    public hasLock(key: string): boolean {
        this.cleanupExpiredLocks();
        return this.locks.has(key);
    }

    public forceRelease(key: string): boolean {
        const existed = this.locks.delete(key);
        if (existed) {
            logger.warn(`Force released lock: ${key}`);
        }
        return existed;
    }

    public getActiveLocks(): string[] {
        this.cleanupExpiredLocks();
        return Array.from(this.locks.keys());
    }
}