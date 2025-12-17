import { Request, Response, Router } from 'express';
import { AuthService } from '../services/auth/auth.service';
import { oauthProviderService } from '../config/oauth.config';
import { AuthValidationService } from '../services/auth/auth-validation.service';
import { AuthUrlService } from '../services/auth/auth-url.service';
import { requireSessionOnly } from '../middleware/auth.middleware';
import { RequestLogger } from "@/utils/request-logger";

export class OAuthController {
    constructor(
        private authService: AuthService,
        private authValidationService: AuthValidationService,
        private authUrlService: AuthUrlService,
        private requestLogger: RequestLogger
    ) {}

    public getAuthUrl = (req: Request, res: Response): Response => {
        try {
            this.requestLogger.logRequest('getAuthUrl', req);
            const email = req.query.email as string;

            if (!email) {
                return this.handleValidationError(res, 'Email parameter is required');
            }

            const authUrl = this.authUrlService.generateAuthUrl(email);

            return res.json({
                success: true,
                message: 'Auth URL generated',
                data: { authUrl }
            });

        } catch (error) {
            return this.handleError(res, 'Failed to generate authentication URL', error);
        }
    };

    public handleCallback = async (req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('handleCallback', req);

            const { code, email, state } = req.body;

            if (!this.authValidationService.isValidCode(code)) {
                return this.handleValidationError(res, 'Invalid authorization code');
            }

            const userEmail = this.authValidationService.resolveEmail(email, state);
            const providerConfig = oauthProviderService.getProviderConfig(userEmail);

            if (!providerConfig) {
                return this.handleValidationError(res, `OAuth not configured for ${userEmail}`);
            }

            const result = await this.authService.handleCallback(code, userEmail, providerConfig);

            if (result.success) {
                return res.json({
                    success: true,
                    message: result.message,
                    data: {
                        user: result.user,
                        sessionId: result.sessionId
                    }
                });
            } else {
                return this.handleError(res, result.message, null, 401);
            }

        } catch (error) {
            return this.handleError(res, 'Authentication failed', error);
        }
    };

    public getUser = (req: Request, res: Response): Response => {
        try {
            this.requestLogger.logRequest('getUser', req);
            const user = req.user;

            if (!user) {
                return this.handleError(res, 'User not found in request', null, 401);
            }

            return res.json({
                success: true,
                message: 'User retrieved',
                data: { user }
            });

        } catch (error) {
            return this.handleError(res, 'Internal server error', error);
        }
    };

    public logout = (req: Request, res: Response): Response => {
        try {
            this.requestLogger.logRequest('logout', req);
            const sessionId = req.sessionId;

            if (!sessionId) {
                return this.handleError(res, 'Session not found', null, 401);
            }

            this.authService.logout(sessionId);

            return res.json({
                success: true,
                message: 'Logout successful'
            });

        } catch (error) {
            return res.json({
                success: true,
                message: 'Logout completed'
            });
        }
    };

    private handleError(res: Response, message: string, error: any, statusCode: number = 500): Response {
        return res.status(statusCode).json({
            success: false,
            message,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }

    private handleValidationError(res: Response, errorMessage: string): Response {
        return this.handleError(res, errorMessage, null, 400);
    }

    public getAuthMiddleware() {
        return requireSessionOnly(this.authService);
    }

    public getRoutes(): Router {
        const router = Router();

        router.get('/auth-url', this.getAuthUrl);
        router.post('/callback', this.handleCallback);
        router.get('/user', this.getAuthMiddleware(), this.getUser);
        router.post('/logout', this.getAuthMiddleware(), this.logout);

        return router;
    }
}