import { EmailFetcherService } from '@/services/email/email-fetcher.service.ts';

declare global {
    namespace Express {
        interface Request {
            emailService?: EmailFetcherService;
            user?: { email: string };
            sessionId?: string;
        }
    }
}