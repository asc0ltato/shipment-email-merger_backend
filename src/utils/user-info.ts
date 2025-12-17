import { logger } from './logger';

export class UserInfo {
    async getUserInfo(accessToken: string, providerConfig: any): Promise<{ email: string }> {
        if (!providerConfig.userInfoUrl) {
            throw new Error('User info URL not configured for this provider');
        }

        const { url, headers } = this.prepareUserInfoRequest(accessToken, providerConfig);
        const response = await fetch(url, { headers });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error('User info request failed:', errorText);
            throw new Error(`Failed to get user info: ${response.status} ${response.statusText}`);
        }

        const userInfo = await response.json();
        logger.debug('User info response:', userInfo);
        
        const email = this.extractEmail(userInfo, providerConfig);
        logger.debug('Extracted email:', email);

        if (!email) {
            logger.error('No email found in user info:', userInfo);
            throw new Error('Could not retrieve email from user info');
        }

        return { email };
    }

    private prepareUserInfoRequest(accessToken: string, providerConfig: any): { url: string; headers: HeadersInit } {
        let userInfoUrl = providerConfig.userInfoUrl;
        const headers: HeadersInit = {
            'Content-Type': 'application/json'
        };

        if (providerConfig.userInfoUrl.includes('mail.ru')) {
            userInfoUrl += `?access_token=${accessToken}`;
        } else if (
            providerConfig.userInfoUrl.includes('google')
        ) {
            headers['Authorization'] = `Bearer ${accessToken}`;
        }

        return { url: userInfoUrl, headers };
    }

    private extractEmail(userInfo: any, providerConfig: any): string | undefined {
        if (providerConfig.userInfoUrl.includes('google')) {
            return userInfo.email;
        } else if (providerConfig.userInfoUrl.includes('mail.ru')) {
            return userInfo.email;
        }
    }
}