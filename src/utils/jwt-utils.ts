import jwt from 'jsonwebtoken';
import { logger } from './logger';

export interface JWTInternalPayload {
    iss: string;
    aud: string;
    sub: string;
    iat: number;
    exp: number;
}

export class JWTUtils {
    private static readonly SECRET = process.env.JWT_SECRET;
    private static readonly AUDIENCE = process.env.JWT_AUDIENCE;

    static verifyInternalToken(token: string, expectedIssuer?: string): JWTInternalPayload {
        if (!this.SECRET) {
            throw new Error('JWT_SECRET not configured');
        }

        try {
            const decoded = jwt.verify(token, this.SECRET, {
                algorithms: ['HS256'],
                audience: this.AUDIENCE,
                issuer: expectedIssuer
            }) as JWTInternalPayload;

            logger.debug('JWT token verified successfully', {
                issuer: decoded.iss,
                audience: decoded.aud,
                subject: decoded.sub,
                expiresAt: new Date(decoded.exp * 1000).toISOString()
            });

            return decoded;

        } catch (error) {
            logger.error('JWT token verification failed:', error);
            throw new Error('Invalid internal API token');
        }
    }

    static isTokenExpired(payload: JWTInternalPayload): boolean {
        const isExpired = Date.now() >= payload.exp * 1000;
        if (isExpired) {
            logger.warn('JWT token expired', {
                issuer: payload.iss,
                subject: payload.sub,
                expiredAt: new Date(payload.exp * 1000).toISOString()
            });
        }
        return isExpired;
    }
}