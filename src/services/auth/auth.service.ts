import { EmailFetcherService } from '../email/email-fetcher.service';
import { SessionManagerService } from './session-manager.service';
import { CredentialsStorageService } from './credentials-storage.service';
import { EmailConnectionManager } from '../email/email-connection-manager';
import { AuthResult } from '@/models/auth';
import { OAuthTokenHandler, UserInfo, logger } from '@/utils';
import {oauthProviderService} from "@/config/oauth.config.ts";

export class AuthService {
    private sessionManager: SessionManagerService;
    private credentialsStorage: CredentialsStorageService;
    private connectionManager: EmailConnectionManager;

    constructor(
        private tokenHandler: OAuthTokenHandler,
        private userInfoService: UserInfo,
        credentialsStorage: CredentialsStorageService
    ) {
        this.sessionManager = SessionManagerService.getInstance();
        this.credentialsStorage = credentialsStorage;
        this.connectionManager = EmailConnectionManager.getInstance();
    }

    async handleCallback(code: string, email: string, providerConfig: any): Promise<AuthResult> {
        try {
            logger.info(`Starting OAuth callback processing for email: ${email}`);

            const tokens = await this.tokenHandler.exchangeCodeForTokens(code, providerConfig);
            logger.info('Tokens successfully received');

            const userInfo = await this.userInfoService.getUserInfo(tokens.access_token, providerConfig);
            logger.info(`User info received: ${userInfo.email}`);

            const emailService = await this.connectionManager.getConnection(
                userInfo.email,
                tokens.access_token,
                providerConfig
            );

            try {
                if (!emailService.isActive()) {
                    await emailService.connect();
                }
                logger.info('Test connection to email service successful');
            } catch (error) {
                logger.warn('Initial email connection check failed, but continuing:', error);
                this.connectionManager.cleanupConnection(userInfo.email);
                throw error;
            }

            await this.credentialsStorage.saveCredentials(
                userInfo.email,
                tokens.access_token,
                providerConfig,
                tokens.refresh_token
            );

            const sessionId = this.sessionManager.createSession(
                userInfo.email,
                tokens.access_token,
                emailService,
                7 * 24 * 60 * 60 * 1000
            );
            logger.info(`Session successfully created with ID: ${sessionId}`);

            return {
                success: true,
                message: 'Authentication successful. Click "Load Data" to get information about your shipments.',
                sessionId,
                user: { email: userInfo.email }
            };

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'OAuth login error';
            logger.error('Authentication service error:', error);

            if (email) {
                this.connectionManager.cleanupConnection(email);
            }

            return {
                success: false,
                message: errorMessage
            };
        }
    }

    validateSession(sessionId: string): { email: string } | null {
        logger.debug(`Validating session: ${sessionId}`);
        const result = this.sessionManager.validateSession(sessionId);
        logger.debug(`Session validation result: ${!!result}`);
        return result;
    }

    getEmailService(sessionId: string) {
        logger.debug(`Getting email service for session: ${sessionId}`);
        const emailService = this.sessionManager.getEmailService(sessionId);

        if (emailService) {
            if (!emailService.isActive()) {
                logger.warn('Email service connection lost for session:', sessionId);
                this.connectionManager.cleanupConnection(emailService.getEmail());
                return null;
            }
            logger.debug('Email service found and active');
        } else {
            logger.debug('Email service for session not found');
        }

        return emailService;
    }

    logout(sessionId: string): boolean {
        logger.info(`Ending session: ${sessionId}`);

        const emailService = this.sessionManager.getEmailService(sessionId);
        if (emailService) {
            this.credentialsStorage.deactivateCredentials(emailService.getEmail());
            this.connectionManager.cleanupConnection(emailService.getEmail());
        }

        return this.sessionManager.logout(sessionId);
    }

    public async refreshEmailService(sessionId: string): Promise<EmailFetcherService | null> {
        try {
            const session = this.sessionManager.getSession(sessionId);
            if (!session) {
                return null;
            }

            const credentials = await this.credentialsStorage.getCredentialsByEmail(session.email);
            if (!credentials) {
                return null;
            }

            const providerConfig = oauthProviderService.getProviderConfig(session.email);
            if (!providerConfig) {
                return null;
            }

            const emailService = await this.connectionManager.refreshConnection(
                session.email,
                credentials.accessToken,
                providerConfig
            );

            this.sessionManager.updateEmailService(sessionId, emailService);

            return emailService;
        } catch (error) {
            logger.error('Error refreshing email service:', error);
            return null;
        }
    }
}