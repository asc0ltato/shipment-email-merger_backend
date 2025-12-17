import { EmailRepository } from '@/repositories';
import { IEmail } from '@/models/email';
import { EmailViewService } from './email-view.service';
import { logger } from '@/utils';

export class EmailAnalysisService {
    constructor(
        private emailRepo: EmailRepository,
        private emailViewService: EmailViewService
    ) {}

    async approveEmail(messageId: string): Promise<{ messageId: string; processedCount: number }> {
        logger.info('Approving email:', { messageId });

        await this.emailViewService.markAsProcessed(messageId);
        const stats = await this.emailViewService.getEmailStats();

        return {
            messageId,
            processedCount: stats.processed
        };
    }

    async getEmailAnalysis(messageId: string) {
        logger.info('Getting email analysis:', { messageId });

        const email = await this.emailRepo.getEmailByMessageId(messageId);

        if (!email) {
            throw new Error('Email not found');
        }

        const isProcessed = email.status === 'processed';

        return {
            email: {
                subject: email.subject,
                from: email.from,
                date: email.date,
                emailGroupIds: [email.emailGroupId],
                isAIAnalyzed: false,
                isApproved: isProcessed
            },
            analysis: null,
            hasAnalysis: false
        };
    }

    async getPendingAnalysis() {
        logger.info('Getting pending analysis');

        const pendingEmails = await this.emailViewService.getNotProcessedEmails();

        return {
            pendingEmails: pendingEmails.map((email: IEmail) => ({
                id: email.id,
                subject: email.subject,
                from: email.from,
                date: email.date,
                emailGroupIds: [email.emailGroupId],
                status: email.status
            })),
            count: pendingEmails.length,
            summary: `Found ${pendingEmails.length} emails pending analysis`
        };
    }
}