import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth/auth.service';
import { logger } from '@/utils';

export const requireAuth = (authService: AuthService) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Пробуем получить sessionId из заголовка Authorization
            const authHeader = req.headers.authorization;
            let sessionId = authHeader?.replace('Bearer ', '');
            
            // Если нет в заголовке, пробуем из query параметра (для SSE запросов)
            if (!sessionId && req.query.sessionId) {
                sessionId = req.query.sessionId as string;
            }

            logger.debug('Auth middleware - sessionId:', sessionId ? 'present' : 'missing');

            if (!sessionId) {
                logger.warn('No sessionId provided in request');
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const user = authService.validateSession(sessionId);
            if (!user) {
                logger.warn('Invalid or expired session:', sessionId);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid or expired session'
                });
            }

            logger.debug('Session validated for user:', user.email);

            let emailService = authService.getEmailService(sessionId);

            if (!emailService) {
                logger.warn('Email service not available, attempting to refresh...');
                emailService = await authService.refreshEmailService(sessionId);
            }

            if (!emailService) {
                logger.warn('Email service not available for session:', sessionId);
                return res.status(401).json({
                    success: false,
                    message: 'Email service not available'
                });
            }

            if (!emailService.isActive()) {
                logger.warn('Email service connection lost, attempting to reconnect...');
                try {
                    await emailService.connect();
                } catch (error) {
                    logger.error('Failed to reconnect email service:', error);
                    return res.status(401).json({
                        success: false,
                        message: 'Email connection lost. Please refresh the page.'
                    });
                }
            }

            req.emailService = emailService;
            req.user = user;
            req.sessionId = sessionId;

            logger.debug('Auth middleware passed successfully');
            next();

        } catch (error) {
            logger.error('Auth middleware error:', error);

            const sessionId = req.headers.authorization?.replace('Bearer ', '');
            if (sessionId) {
                authService.logout(sessionId);
            }

            return res.status(401).json({
                success: false,
                message: 'Authentication failed'
            });
        }
    };
};

export const requireSessionOnly = (authService: AuthService) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const authHeader = req.headers.authorization;
            const sessionId = authHeader?.replace('Bearer ', '');

            if (!sessionId) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const user = authService.validateSession(sessionId);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid or expired session'
                });
            }

            req.user = user;
            req.sessionId = sessionId;
            next();

        } catch (error) {
            logger.error('Session validation error:', error);
            return res.status(401).json({
                success: false,
                message: 'Authentication failed'
            });
        }
    };
};