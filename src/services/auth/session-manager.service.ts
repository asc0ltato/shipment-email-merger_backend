import { EmailFetcherService } from '../email/email-fetcher.service';
import { SessionData } from '@/models/auth';
import { logger } from '@/utils';

export class SessionManagerService {
    private static instance: SessionManagerService;
    private activeSessions: Map<string, SessionData> = new Map();
    private sessionCleanupInterval: NodeJS.Timeout;

    private constructor() {
        logger.info('Session manager initialized');

        this.sessionCleanupInterval = setInterval(() => {
            this.cleanupExpiredSessions();
        }, 30 * 60 * 1000);
    }

    public static getInstance(): SessionManagerService {
        if (!SessionManagerService.instance) {
            SessionManagerService.instance = new SessionManagerService();
        }
        return SessionManagerService.instance;
    }

    createSession(
        email: string,
        accessToken: string,
        emailService: EmailFetcherService,
        ttlMs: number = 7 * 24 * 60 * 60 * 1000
    ): string {
        const sessionId = this.generateSessionId();
        const expires = new Date(Date.now() + ttlMs);

        this.activeSessions.set(sessionId, {
            email,
            accessToken,
            emailService,
            expires,
            lastActivity: new Date()
        });

        logger.info(`Session created. Total active sessions: ${this.activeSessions.size}`);
        logger.debug(`Session TTL: ${ttlMs}ms, expires: ${expires.toISOString()}`);
        return sessionId;
    }

    private generateSessionId(): string {
        return 'sess_' + Math.random().toString(36).substring(2) + '_' + Date.now().toString(36);
    }

    validateSession(sessionId: string): { email: string } | null {
        if (!sessionId || !sessionId.startsWith('sess_')) {
            return null;
        }

        const session = this.activeSessions.get(sessionId);
        if (!session || new Date() > session.expires) {
            if (session) {
                this.logout(sessionId);
            }
            return null;
        }

        session.lastActivity = new Date();

        this.extendSession(sessionId);

        return { email: session.email };
    }

    private extendSession(sessionId: string): void {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
            session.expires = newExpires;
            logger.debug(`Session ${sessionId} extended to ${newExpires.toISOString()}`);
        }
    }

    getEmailService(sessionId: string): EmailFetcherService | null {
        const session = this.activeSessions.get(sessionId);
        return session ? session.emailService : null;
    }

    logout(sessionId: string): boolean {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.emailService.disconnect().catch((err: any) => {
                logger.error('Error disconnecting email service:', err);
            });
            this.activeSessions.delete(sessionId);
            logger.info(`Session ended: ${sessionId}. Remaining sessions: ${this.activeSessions.size}`);
            return true;
        }
        return false;
    }

    private cleanupExpiredSessions(): void {
        const now = new Date();
        let cleanedCount = 0;

        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (now > session.expires) {
                this.logout(sessionId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            logger.info(`Cleaned up ${cleanedCount} expired sessions`);
        }
    }

    public getSession(sessionId: string): SessionData | null {
        return this.activeSessions.get(sessionId) || null;
    }

    public updateEmailService(sessionId: string, emailService: EmailFetcherService): boolean {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.emailService = emailService;
            session.lastActivity = new Date();
            return true;
        }
        return false;
    }
}