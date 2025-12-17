import { CredentialsStorageService } from '../auth/credentials-storage.service';
import { EmailViewService } from './email-view.service';
import { EmailFullSyncService } from './email-full-sync.service';
import { UserRepository } from '@/repositories';
import { oauthProviderService } from '@/config/oauth.config';
import { EmailFetcherService } from './email-fetcher.service';
import { AiAnalysisService } from '../ai/ai-analysis.service';
import { logger } from '@/utils';

export class EmailAutoSyncService {
    private isRunning: boolean = false;
    private syncInterval: NodeJS.Timeout | null = null;
    private lastSyncTime: Date | null = null;
    private scheduledTime: string = '08:00';
    private aiAnalysisService: AiAnalysisService | null = null;

    constructor(
        private credentialsStorage: CredentialsStorageService,
        private emailFullSyncService: EmailFullSyncService,
        private emailViewService: EmailViewService,
        private userRepository: UserRepository,
        aiAnalysisService?: AiAnalysisService
    ) {
        this.aiAnalysisService = aiAnalysisService || null;
    }

    public startAutoSync(scheduledTime: string = '08:00'): void {
        if (this.isRunning) {
            logger.info('Auto sync is already running');
            return;
        }

        this.isRunning = true;
        this.scheduledTime = scheduledTime;

        logger.info(`Starting daily auto sync at ${scheduledTime}`);

        this.scheduleNextSync();
    }

    private scheduleNextSync(): void {
        if (!this.isRunning) return;

        const now = new Date();
        const [scheduledHours, scheduledMinutes] = this.scheduledTime.split(':').map(Number);

        const nextSync = new Date();
        nextSync.setHours(scheduledHours, scheduledMinutes, 0, 0);

        if (now > nextSync) {
            nextSync.setDate(nextSync.getDate() + 1);
        }

        const timeUntilNextSync = nextSync.getTime() - now.getTime();

        logger.info(`Next auto sync scheduled at: ${nextSync.toLocaleString()}`);
        logger.info(`Time until next sync: ${Math.round(timeUntilNextSync / 1000 / 60)} minutes`);

        if (this.syncInterval) {
            clearTimeout(this.syncInterval);
        }

        this.syncInterval = setTimeout(() => {
            this.executeAutoSync();
            this.scheduleNextSync();
        }, timeUntilNextSync);
    }

    public async executeAutoSync(): Promise<void> {
        try {
            logger.info('Executing scheduled auto sync');

            const allCredentials = await this.credentialsStorage.getAllActiveCredentials();

            if (allCredentials.length === 0) {
                logger.debug('No active credentials for auto sync');
                return;
            }

            logger.info(`Auto syncing for ${allCredentials.length} users`);

            for (const credentials of allCredentials) {
                await this.syncSingleUser(credentials);
            }

            this.lastSyncTime = new Date();

            logger.info(`Auto sync completed at ${this.lastSyncTime.toISOString()}`);

        } catch (error) {
            logger.error('Error in auto sync process:', error);
        }
    }

   private async syncSingleUser(credentials: any): Promise<void> {
        let emailFetcher: any = null;
        try {
            const user = await this.userRepository.getUserByEmail(credentials.email);
            if (!user || !user.id) {
                logger.warn(`User not found in database: ${credentials.email}`);
                return;
            }

            const providerConfig = oauthProviderService.getProviderConfig(credentials.email);
            if (!providerConfig) {
                logger.error(`No OAuth configuration found for email: ${credentials.email}`);
                await this.credentialsStorage.deactivateCredentials(credentials.email);
                return;
            }

            emailFetcher = this.createEmailFetcher(credentials, providerConfig);
            const result = await this.emailFullSyncService.syncRecentEmails(
                emailFetcher,
                user.id,
                1
            );

            await this.emailViewService.handlePostSyncState();
            await this.userRepository.updateAccessToken(credentials.email, credentials.accessToken);

            logger.info(`Auto sync for ${credentials.email}: ${result.created} new groups, ${result.updated} updated groups, ${result.newEmails} new emails`);

            if (this.aiAnalysisService && (result.created > 0 || result.updated > 0)) {
                await this.generateSummariesForUser(user.id);
            }

        } catch (error) {
            logger.error(`Auto sync failed for ${credentials.email}:`, error);
            this.handleSyncError(error, credentials.email);
        } finally {
            if (emailFetcher) {
                await emailFetcher.safeDisconnect().catch((err: any) => {
                    logger.warn(`Error disconnecting email fetcher for ${credentials.email}:`, err);
                });
            }
        }
    }

    private async generateSummariesForUser(userId: number): Promise<void> {
        try {
            logger.info(`Starting AI summaries generation for user ${userId}`);
    
            if (!this.aiAnalysisService) {
                logger.warn('AI analysis service not available for summary generation');
                return;
            }
    
            const result = await this.aiAnalysisService.generateSummariesForNeedingGroups();
    
            if (result.processed > 0) {
                logger.info(`Auto-generated ${result.processed} AI summaries for user ${userId} (out of ${result.total} groups)`);
            } else {
                logger.info(`All email groups already have summaries for user ${userId}`);
            }
    
        } catch (error) {
            logger.error(`Failed to generate AI summaries for user ${userId}:`, error);
        }
    }

    public getLastSyncTime(): Date | null {
        return this.lastSyncTime;
    }

    public getFormattedLastSyncTime(): string {
        if (!this.lastSyncTime) {
            return 'never';
        }

        const now = new Date();
        const diffMs = now.getTime() - this.lastSyncTime.getTime();
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 5) {
            return 'Just now';
        } else if (diffSecs < 60) {
            return `${diffSecs} seconds ago`;
        } else if (diffMins === 1) {
            return '1 minute ago';
        } else if (diffMins < 60) {
            return `${diffMins} minutes ago`;
        } else if (diffHours === 1) {
            return '1 hour ago';
        } else if (diffHours < 24) {
            return `${diffHours} hours ago`;
        } else if (diffDays === 1) {
            return '1 day ago';
        } else {
            return `${diffDays} days ago`;
        }
    }

    public getNextSyncTime(): Date {
        const now = new Date();
        const [scheduledHours, scheduledMinutes] = this.scheduledTime.split(':').map(Number);

        const nextSync = new Date();
        nextSync.setHours(scheduledHours, scheduledMinutes, 0, 0);

        if (now > nextSync) {
            nextSync.setDate(nextSync.getDate() + 1);
        }

        return nextSync;
    }

    public getFormattedNextSyncTime(): string {
        const nextSync = this.getNextSyncTime();
        return nextSync.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    }

    private createEmailFetcher(credentials: any, providerConfig: any): EmailFetcherService {
        return new EmailFetcherService(
            {
                email: credentials.email,
                accessToken: credentials.accessToken
            },
            providerConfig
        );
    }

    private async handleSyncError(error: any, email: string): Promise<void> {
        if (this.isAuthError(error)) {
            await this.credentialsStorage.deactivateCredentials(email);
            logger.warn(`Deactivated credentials for ${email} due to auth error`);
        }
    }

    private isAuthError(error: any): boolean {
        const errorMessage = error?.message?.toLowerCase() || '';
        return errorMessage.includes('auth') ||
            errorMessage.includes('token') ||
            errorMessage.includes('unauthorized') ||
            errorMessage.includes('invalid');
    }

    public isAutoSyncRunning(): boolean {
        return this.isRunning;
    }

    public stopAutoSync(): void {
        this.isRunning = false;
        if (this.syncInterval) {
            clearTimeout(this.syncInterval);
            this.syncInterval = null;
        }
        logger.info('Auto sync stopped');
    }

    public updateScheduleTime(newTime: string): void {
        this.scheduledTime = newTime;
        if (this.isRunning) {
            this.scheduleNextSync();
        }
        logger.info(`Auto sync schedule updated to: ${newTime}`);
    }
}