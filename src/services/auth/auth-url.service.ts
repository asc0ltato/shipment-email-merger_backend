import { oauthProviderService } from '@/config/oauth.config.ts';
import { logger } from '@/utils';

export class AuthUrlService {
    generateAuthUrl(email: string): string {
        logger.info('AuthUrlService.generateAuthUrl called with email:', email);

        if (!email) {
            logger.error('Email parameter is required but not provided');
            throw new Error('Email parameter is required');
        }

        logger.info('Getting provider config for email:', email);
        const providerConfig = oauthProviderService.getProviderConfig(email);

        if (!providerConfig) {
            logger.error(`No OAuth configuration found for email: ${email}`);
            throw new Error(`OAuth not configured for ${email}`);
        }

        const lowerEmail = email.toLowerCase();
        let providerName = 'Unknown';
        if (lowerEmail.includes('gmail.com')) {
            providerName = 'Google';
        } else if (lowerEmail.includes('mail.ru')) {
            providerName = 'Mail.ru';
        }

        logger.info('Provider config found:', {
            provider: providerName,
            authUrl: providerConfig.authUrl,
            clientId: providerConfig.clientId ? 'SET' : 'MISSING',
            redirectUri: providerConfig.redirectUri,
            scope: providerConfig.scope
        });

        try {
            const authUrl = oauthProviderService.generateAuthUrl(email, providerConfig);
            logger.info('Successfully generated auth URL', {
                urlLength: authUrl.length,
                urlPreview: authUrl.substring(0, 100) + '...'
            });

            return authUrl;
        } catch (error) {
            logger.error('Error generating auth URL:', error);
            throw new Error(`Failed to generate authentication URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}