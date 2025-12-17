import { OAuthProviderConfig } from '@/models/auth';
import { logger } from '@/utils';

const commonRedirectUri = process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback';

const oauthProvidersConfig: { [key: string]: OAuthProviderConfig } = {
    'gmail.com': {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: commonRedirectUri,
        authUrl: 'https://accounts.google.com/o/oauth2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
        scope: [
            'https://mail.google.com/',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/userinfo.email',
            'openid'
        ],
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        imapAuthMethod: 'XOAUTH2'
    },
    'mail.ru': {
        clientId: process.env.MAILRU_CLIENT_ID || '',
        clientSecret: process.env.MAILRU_CLIENT_SECRET || '',
        redirectUri: commonRedirectUri,
        authUrl: 'https://oauth.mail.ru/login',
        tokenUrl: 'https://oauth.mail.ru/token',
        userInfoUrl: 'https://oauth.mail.ru/userinfo',
        scope: ['userinfo', 'mail.imap'],
        imapHost: 'imap.mail.ru',
        imapPort: 993,
        imapAuthMethod: 'XOAUTH2'
    }
};

export class OAuthProviderService {
    private isConfigValid(config: OAuthProviderConfig): boolean {
        return !!(config.clientId && config.clientSecret);
    }

    public getProviderConfig(email: string): OAuthProviderConfig | null {
        const domain = email.split('@')[1]?.toLowerCase();

        for (const [providerDomain, config] of Object.entries(oauthProvidersConfig)) {
            if (domain?.includes(providerDomain)) {
                if (!this.isConfigValid(config)) {
                    logger.error(`OAuth not configured for ${providerDomain}. Check your .env file!`);
                    logger.error(`Required: ${providerDomain.toUpperCase()}_CLIENT_ID and ${providerDomain.toUpperCase()}_CLIENT_SECRET`);
                    return null;
                }
                logger.info(`OAuth config for ${providerDomain}: Ready to use`);
                return config;
            }
        }

        logger.error(`No OAuth config found for domain: ${domain}`);
        return null;
    }

    public generateAuthUrl(email: string, providerConfig: OAuthProviderConfig): string {
        const authUrl = new URL(providerConfig.authUrl);
        authUrl.searchParams.set('client_id', providerConfig.clientId);
        authUrl.searchParams.set('redirect_uri', providerConfig.redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', providerConfig.scope.join(' '));

        const state = Buffer.from(email).toString('base64');
        authUrl.searchParams.set('state', state);

        this.addProviderSpecificParams(email, authUrl);

        return authUrl.toString();
    }

    private addProviderSpecificParams(email: string, authUrl: URL): void {
        if (email.includes('gmail.com')) {
            authUrl.searchParams.set('access_type', 'offline');
            authUrl.searchParams.set('prompt', 'consent');
        }
    }
}

export const oauthProviderService = new OAuthProviderService();