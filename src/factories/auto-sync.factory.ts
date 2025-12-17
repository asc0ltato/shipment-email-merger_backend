import { CredentialsStorageService } from '@/services/auth/credentials-storage.service';
import { EmailAutoSyncService } from '@/services/email/email-auto-sync.service';
import { EmailViewService } from '@/services/email/email-view.service';
import { EmailBaseService } from '@/services/email/email-base.service';
import { EmailFullSyncService } from '@/services/email/email-full-sync.service';
import { EmailGroupRepository, EmailRepository, UserRepository, SummaryRepository } from '@/repositories';
import { database } from '@/config/database.init';
import { logger } from '@/utils';
import { GeminiService } from '@/services/ai/gemini.service';
import { AiAnalysisService } from '@/services/ai/ai-analysis.service';
import { SummaryService } from '@/services/summary/summary.service';

export class AutoSyncFactory {
    public static createEmailAutoSyncService(): EmailAutoSyncService {
        try {
            const sequelize = database.getSequelize();
            const credentialsStorage = CredentialsStorageService.getInstance(sequelize);

            const emailGroupRepo = new EmailGroupRepository(sequelize);
            const emailRepo = new EmailRepository(sequelize);
            const userRepo = new UserRepository(sequelize);
            const summaryRepo = new SummaryRepository(sequelize);

            const emailBaseService = new EmailBaseService(emailGroupRepo, emailRepo, summaryRepo);
            const emailFullSyncService = new EmailFullSyncService(emailBaseService);
            const emailViewService = new EmailViewService(emailRepo);

            const geminiService = GeminiService.getInstance();
            const summaryService = new SummaryService(summaryRepo);
            const aiAnalysisService = new AiAnalysisService(
                geminiService,
                emailGroupRepo,
                summaryService
            );

            const autoSyncService = new EmailAutoSyncService(
                credentialsStorage,
                emailFullSyncService,
                emailViewService,
                userRepo,
                aiAnalysisService
            );

            logger.info('Auto sync service created successfully with AI summary generation');
            return autoSyncService;

        } catch (error) {
            logger.error('Failed to create auto sync service:', error);
            throw error;
        }
    }
}