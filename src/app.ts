import express from 'express';
import cors from 'cors';
import { appConfig } from './config/app.config';
import { database } from './config/database.init';
import { AutoSyncInitializer } from './config/auto-sync.init';
import { ControllerFactory } from './factories/controller.factory';
import { logger } from '@/utils'
import { requireInternalAuth } from "@/middleware/internal-auth.middleware.ts";

database.initialize().then(() => {
    logger.info('Database initialized successfully');

    setTimeout(() => {
        try {
            AutoSyncInitializer.startAutoSync('08:00');
            logger.info('Daily auto sync scheduled successfully for 08:00');
        } catch (error) {
            logger.error('Failed to start auto sync:', error);
        }
    }, 10000);

}).catch((error) => {
    logger.error('Database initialization error:', error);
});

const app = express();

const getCorsOrigins = (): string[] => {
    const defaultOrigins = [
        'http://localhost:3000',
        'http://frontend:3000',
        'http://localhost:3001',
        'http://backend:3001',
        'http://127.0.0.1:3000'
    ];

    const corsOrigin = process.env.CORS_ORIGIN;
    if (corsOrigin) {
        const originsFromEnv = corsOrigin.split(',').map(origin => origin.trim()).filter(Boolean);
        return [...defaultOrigins, ...originsFromEnv];
    }

    return defaultOrigins;
};

app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = getCorsOrigins();

        if (!origin || origin === 'null') {
            logger.debug('CORS: Allowing request without origin (null)');
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            if (appConfig.env === 'development' && (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.startsWith('file://'))) {
                logger.debug(`CORS: Allowing local origin in development: ${origin}`);
                return callback(null, true);
            }
            logger.warn(`CORS: Blocked origin ${origin}. Allowed origins: ${allowedOrigins.join(', ')}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'Content-Type']
}));

app.use(express.json());

app.get('/api/health', (_req, res) => {
    const autoSyncService = AutoSyncInitializer.getAutoSyncService();

    res.json({
        status: 'OK',
        database: database.getIsInitialized() ? 'connected' : 'disconnected',
        port: appConfig.port,
        autoSync: autoSyncService?.isAutoSyncRunning() ? 'running' : 'stopped',
        timestamp: new Date().toISOString()
    });
});

const oauthController = ControllerFactory.createOAuthController();
const emailController = ControllerFactory.createEmailController();
const emailGroupController = ControllerFactory.createEmailGroupController();
const autoSyncController = ControllerFactory.createAutoSyncController();

app.use('/api/oauth', oauthController.getRoutes());
app.use('/api/email', emailController.getRoutes());
app.use('/api/email-groups', emailGroupController.getRoutes());
app.use('/api/auto-sync', autoSyncController.getRoutes());
app.get('/api/internal/email-groups/approved', requireInternalAuth, emailGroupController.getApprovedEmailGroups);
app.get('/api/internal/health', requireInternalAuth, (_req, res) => {
    res.json({
        status: 'OK',
        service: 'main-api',
        timestamp: new Date().toISOString()
    });
});

app.use('*', (_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

export default app;