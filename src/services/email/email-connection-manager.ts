import { EmailFetcherService } from './email-fetcher.service';
import { logger } from '@/utils';

export class EmailConnectionManager {
    private static instance: EmailConnectionManager;
    private activeConnections: Map<string, EmailFetcherService> = new Map();
    private connectionLocks: Map<string, Promise<EmailFetcherService>> = new Map();

    private constructor() {}

    public static getInstance(): EmailConnectionManager {
        if (!EmailConnectionManager.instance) {
            EmailConnectionManager.instance = new EmailConnectionManager();
        }
        return EmailConnectionManager.instance;
    }

    public async getConnection(
        email: string,
        accessToken: string,
        providerConfig: any
    ): Promise<EmailFetcherService> {
        const existingConnection = this.activeConnections.get(email);
        if (existingConnection && existingConnection.isActive()) {
            logger.debug(`Using existing connection for: ${email}`);
            return existingConnection;
        }

        const existingLock = this.connectionLocks.get(email);
        if (existingLock) {
            logger.debug(`Waiting for existing connection lock for: ${email}`);
            return existingLock;
        }

        logger.info(`Creating new IMAP connection for: ${email}`);
        const connectionPromise = this.createNewConnection(email, accessToken, providerConfig);
        this.connectionLocks.set(email, connectionPromise);

        try {
            const connection = await connectionPromise;
            this.activeConnections.set(email, connection);
            logger.info(`IMAP connection established for: ${email}`);
            return connection;
        } catch (error) {
            logger.error(`Failed to create IMAP connection for ${email}:`, error);
            throw error;
        } finally {
            this.connectionLocks.delete(email);
        }
    }

    private async createNewConnection(
        email: string,
        accessToken: string,
        providerConfig: any
    ): Promise<EmailFetcherService> {
        const connection = new EmailFetcherService(
            { email, accessToken },
            providerConfig
        );

        await connection.connect();
        return connection;
    }

    public cleanupConnection(email: string): void {
        const connection = this.activeConnections.get(email);
        if (connection) {
            logger.info(`Cleaning up connection for: ${email}`);
            connection.safeDisconnect().catch(error => {
                logger.warn(`Error during safe disconnect for ${email}:`, error);
            });
            this.activeConnections.delete(email);
        }
    }

    public async refreshConnection(email: string, accessToken: string, providerConfig: any): Promise<EmailFetcherService> {
        logger.info(`Refreshing connection for: ${email}`);
        this.cleanupConnection(email);
        return this.getConnection(email, accessToken, providerConfig);
    }

    public forceCleanup(): void {
        logger.info('Force cleaning up all connections');
        for (const [email, connection] of this.activeConnections.entries()) {
            connection.safeDisconnect().catch(error => {
                logger.warn(`Error disconnecting ${email}:`, error);
            });
        }
        this.activeConnections.clear();
        this.connectionLocks.clear();
    }
}