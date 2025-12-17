export interface OAuthProviderConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    authUrl: string;
    tokenUrl: string;
    scope: string[];
    userInfoUrl?: string;
    imapHost: string;
    imapPort: number;
    imapAuthMethod: 'XOAUTH2';
}