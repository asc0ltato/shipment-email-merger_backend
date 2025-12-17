import { logger } from './logger';

export class OAuthTokenHandler {
    async exchangeCodeForTokens(code: string, providerConfig: any): Promise<any> {
        if (!this.isValidCode(code)) {
            throw new Error('Invalid authorization code');
        }

        const tokenParams = this.createTokenParams(code, providerConfig);
        const response = await this.makeTokenRequest(providerConfig.tokenUrl, tokenParams);

        if (!response.ok) {
            throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
        }

        return await this.parseTokenResponse(response);
    }

    private isValidCode(code: string): boolean {
        return code.length >= 10;
    }

    private createTokenParams(code: string, providerConfig: any): URLSearchParams {
        if (providerConfig.tokenUrl.includes('mail.ru')) {
            return this.createMailRuTokenParams(code, providerConfig);
        } else {
            return this.createStandardTokenParams(code, providerConfig);
        }
    }

    private createMailRuTokenParams(code: string, providerConfig: any): URLSearchParams {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('client_id', providerConfig.clientId);
        params.append('client_secret', providerConfig.clientSecret);
        params.append('redirect_uri', providerConfig.redirectUri);

        if (providerConfig.scope?.length > 0) {
            params.append('scope', providerConfig.scope.join(' '));
        }

        return params;
    }


    private createStandardTokenParams(code: string, providerConfig: any): URLSearchParams {
        return new URLSearchParams({
            client_id: providerConfig.clientId,
            client_secret: providerConfig.clientSecret,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: providerConfig.redirectUri,
        });
    }

    private async makeTokenRequest(url: string, params: URLSearchParams): Promise<Response> {
        return await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'ShipmentTracker/1.0'
            },
            body: params,
        });
    }

    private async parseTokenResponse(response: Response): Promise<any> {
        const responseText = await response.text();
        logger.debug('Token response:', responseText);
        
        const tokenData = JSON.parse(responseText);

        if (!tokenData.access_token) {
            logger.error('No access token in response:', tokenData);
            if (tokenData.error === 'token not found') {
                throw new Error('Authorization code expired or already used. Please try logging in again.');
            }
            if (tokenData.error === 'invalid_grant') {
                throw new Error('Invalid authorization code. Please try logging in again.');
            }
            if (tokenData.error === 'invalid_client') {
                throw new Error('OAuth configuration error. Please contact support.');
            }
            throw new Error(`No access token received from OAuth provider: ${tokenData.error || 'Unknown error'}`);
        }

        logger.info('Access token received successfully');
        return tokenData;
    }
}