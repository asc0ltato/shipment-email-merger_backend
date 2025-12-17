import { Request, Response, Router } from 'express';
import { AutoSyncInitializer } from '@/config/auto-sync.init';
import { logger } from '@/utils';

export class AutoSyncController {

    public getAutoSyncStatus = async (req: Request, res: Response): Promise<Response> => {
        try {
            const autoSyncService = AutoSyncInitializer.getAutoSyncService();

            return res.json({
                success: true,
                data: {
                    isRunning: autoSyncService?.isAutoSyncRunning() || false,
                    lastSyncTime: autoSyncService?.getLastSyncTime(),
                    formattedLastSyncTime: autoSyncService?.getFormattedLastSyncTime() || 'Never',
                    nextSyncTime: autoSyncService?.getNextSyncTime(),
                    formattedNextSyncTime: autoSyncService?.getFormattedNextSyncTime() || '08:00'
                }
            });

        } catch (error) {
            logger.error('Error getting auto sync status:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get auto sync status'
            });
        }
    };

    public getRoutes(): Router {
        const router = Router();
        router.get('/status', this.getAutoSyncStatus);
        return router;
    }
}