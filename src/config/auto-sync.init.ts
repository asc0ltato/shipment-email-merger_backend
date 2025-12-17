import { EmailAutoSyncService } from '@/services/email/email-auto-sync.service';
import { AutoSyncFactory } from '@/factories/auto-sync.factory';
import { logger } from '@/utils';

export class AutoSyncInitializer {
    private static autoSyncService: EmailAutoSyncService;

    public static initialize(): EmailAutoSyncService {
        try {
            this.autoSyncService = AutoSyncFactory.createEmailAutoSyncService();
            logger.info('Auto sync service initialized');
            return this.autoSyncService;

        } catch (error) {
            logger.error('Failed to initialize auto sync:', error);
            throw error;
        }
    }

    public static startAutoSync(scheduledTime: string = '08:00'): void {
        if (!this.autoSyncService) {
            this.initialize();
        }

        this.autoSyncService.startAutoSync(scheduledTime);
        logger.info(`Daily auto sync scheduled at: ${scheduledTime}`);
    }

    public static getAutoSyncService(): EmailAutoSyncService | null {
        return this.autoSyncService;
    }
}