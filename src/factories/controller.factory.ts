import { database } from '@/config/database.init';
import { OAuthTokenHandler, UserInfo, RequestLogger } from '@/utils';
import { AuthService } from '@/services/auth/auth.service';
import { AuthValidationService } from '@/services/auth/auth-validation.service';
import { AuthUrlService } from '@/services/auth/auth-url.service';
import { EmailGroupRepository, EmailRepository, AttachmentRepository, UserRepository, SummaryRepository } from '@/repositories';
import { DeepseekService } from '@/services/ai/deepseek.service';

import { OAuthController } from '@/controllers/oauth.controller';
import { EmailController } from '@/controllers/email.controller';
import { EmailGroupController } from '@/controllers/email-group.controller';

import { SummaryService } from '@/services/summary/summary.service';
import { EmailAnalysisService } from '@/services/email/email-analysis.service';
import { EmailGroupManagementService } from '@/services/email-group/email-group-management.service';
import { AttachmentService } from '@/services/email-group/attachment.service';
import { AiAnalysisService } from '@/services/ai/ai-analysis.service';
import { EmailViewService } from '@/services/email/email-view.service';
import { CredentialsStorageService } from '@/services/auth/credentials-storage.service';
import { EmailBaseService } from '@/services/email/email-base.service';
import { EmailTargetedService } from '@/services/email/email-targeted.service';
import { EmailFullSyncService } from '@/services/email/email-full-sync.service';
import { AutoSyncController } from "@/controllers/auto-sync.controller.ts";

export class ControllerFactory {
    private static database = database;
    private static tokenHandler = new OAuthTokenHandler();
    private static userInfoService = new UserInfo();
    private static authValidationService = new AuthValidationService();
    private static authUrlService = new AuthUrlService();
    private static deepseekService = DeepseekService.getInstance();

    private static requestLoggerService = new RequestLogger();

    private static createRepositories() {
        const sequelize = this.database.getSequelize();
        return {
            summaryRepo: new SummaryRepository(sequelize),
            emailGroupRepo: new EmailGroupRepository(sequelize),
            emailRepo: new EmailRepository(sequelize),
            attachmentRepo: new AttachmentRepository(sequelize),
            userRepo: new UserRepository(sequelize)
        };
    }

    private static createAuthService(): AuthService {
        const sequelize = this.database.getSequelize();
        const credentialsStorage = CredentialsStorageService.getInstance(sequelize);

        return new AuthService(
            this.tokenHandler,
            this.userInfoService,
            credentialsStorage
        );
    }

    private static createEmailServices() {
        const { emailGroupRepo, emailRepo, summaryRepo } = this.createRepositories();

        const emailBaseService = new EmailBaseService(emailGroupRepo, emailRepo, summaryRepo);
        const emailTargetedService = new EmailTargetedService(emailBaseService, emailRepo);
        const emailFullSyncService = new EmailFullSyncService(emailBaseService);
        const emailViewService = new EmailViewService(emailRepo);
        const summaryService = new SummaryService(summaryRepo);

        return {
            emailBaseService,
            emailTargetedService,
            emailFullSyncService,
            emailViewService,
            summaryService
        };
    }

    public static createOAuthController(): OAuthController {
        const authService = this.createAuthService();

        return new OAuthController(
            authService,
            this.authValidationService,
            this.authUrlService,
            this.requestLoggerService
        );
    }

    public static createEmailController(): EmailController {
        const authService = this.createAuthService();
        const { userRepo, emailRepo } = this.createRepositories();
        const { emailBaseService, emailTargetedService, emailFullSyncService, emailViewService } = this.createEmailServices();

        const emailAnalysisService = new EmailAnalysisService(emailRepo, emailViewService);

        return new EmailController(
            authService,
            emailAnalysisService,
            emailViewService,
            emailTargetedService,
            emailFullSyncService,
            emailBaseService,
            this.requestLoggerService,
            userRepo
        );
    }

    public static createEmailGroupController(): EmailGroupController {
        const authService = this.createAuthService();
        const { emailGroupRepo, emailRepo, attachmentRepo, summaryRepo } = this.createRepositories();
        const { summaryService } = this.createEmailServices();

        const emailGroupManagementService = new EmailGroupManagementService(
            emailGroupRepo,
            emailRepo,
            attachmentRepo,
            summaryRepo
        );
        const attachmentService = new AttachmentService(attachmentRepo);
        const aiAnalysisService = new AiAnalysisService(this.deepseekService, emailGroupRepo, summaryService);

        return new EmailGroupController(
            authService,
            emailGroupManagementService,
            attachmentService,
            aiAnalysisService,
            this.requestLoggerService,
            emailGroupRepo
        );
    }

    public static createAutoSyncController(): AutoSyncController {
        return new AutoSyncController();
    }
}