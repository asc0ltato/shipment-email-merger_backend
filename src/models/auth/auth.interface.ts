import { EmailFetcherService } from '@/services/email/email-fetcher.service.ts';

export interface SessionData {
    email: string;
    accessToken: string;
    emailService: EmailFetcherService;
    expires: Date;
    lastActivity: Date;
}

export interface AuthResult {
    success: boolean;
    message: string;
    sessionId?: string;
    user?: { email: string };
}

export interface User {
    id?: number;
    email: string;
    accessToken: string;
    refreshToken?: string;
    lastSync: Date;
    isActive: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}