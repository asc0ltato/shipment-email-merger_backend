import { Request, Response, NextFunction } from 'express';
import { JWTUtils } from '@/utils/jwt-utils';
import { logger } from '@/utils';

export const requireInternalAuth = (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            logger.warn('Missing internal API token', {
                ip: req.ip,
                path: req.path
            });
            return res.status(401).json({
                success: false,
                message: 'Internal API authentication required'
            });
        }

        const payload = JWTUtils.verifyInternalToken(token, process.env.JWT_MAIN_SERVICE_ISSUER);

        if (JWTUtils.isTokenExpired(payload)) {
            logger.warn('Expired internal API token', {
                issuer: payload.iss,
                subject: payload.sub
            });
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }

        logger.debug('Internal JWT authentication successful', {
            issuer: payload.iss,
            subject: payload.sub,
            path: req.path
        });

        next();

    } catch (error) {
        logger.error('Internal JWT auth middleware error:', error);
        return res.status(401).json({
            success: false,
            message: 'Internal API authentication failed'
        });
    }
};