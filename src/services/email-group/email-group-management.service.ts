import { EmailGroupRepository, EmailRepository, AttachmentRepository, SummaryRepository } from '@/repositories';
import { IEmailGroup } from '@/models/email-group';
import { SummaryService } from '../summary/summary.service';
import { WebSocketService } from '../websocket/websocket.service';
import { SSEService } from '../sse/sse.service';
import { logger } from '@/utils';

export class EmailGroupManagementService {
    private summaryService: SummaryService;
    private wsService: WebSocketService;
    private sseService: SSEService;

    constructor(
        private emailGroupRepo: EmailGroupRepository,
        private emailRepo: EmailRepository,
        private attachmentRepo: AttachmentRepository,
        private summaryRepo: SummaryRepository
    ) {
        this.summaryService = new SummaryService(summaryRepo);
        this.wsService = WebSocketService.getInstance();
        this.sseService = SSEService.getInstance();
    }

    async getAllEmailGroups(): Promise<{
        emailGroups: IEmailGroup[];
        statistics: {
            totalEmailGroups: number;
            totalEmails: number;
            totalAttachments: number;
        };
    }> {
        const emailGroups = await this.emailGroupRepo.getAllEmailGroups();
        const totalEmails = await this.emailRepo.getTotalEmailsCount();
        const totalAttachments = await this.attachmentRepo.getTotalAttachmentsCount();

        return {
            emailGroups,
            statistics: {
                totalEmailGroups: emailGroups.length,
                totalEmails,
                totalAttachments
            }
        };
    }

    async getApprovedEmailGroups(): Promise<{
        emailGroups: IEmailGroup[];
        emailStats: { new: number; processing: number; processed: number; failed: number; total: number };
    }> {
        const emailGroups = await this.emailGroupRepo.getApprovedEmailGroups();
        const emailStats = await this.getEmailStats();

        return { emailGroups, emailStats };
    }

   async deleteEmailGroup(emailGroupId: string): Promise<{ deleted: boolean }> {
        try {
            logger.info(`Deleting email group: ${emailGroupId}`);

            const emailGroup = await this.emailGroupRepo.getEmailGroupByEmailGroupId(emailGroupId);
            if (!emailGroup) {
                throw new Error('Email group not found');
            }

            await this.emailRepo.deleteEmailsByEmailGroupId(emailGroupId);

            const summaries = await this.summaryService.getSummariesByEmailGroupId(emailGroupId);
            for (const summary of summaries) {
                await this.summaryRepo.deleteSummary(summary.summaryId);
            }

            const deleted = await this.emailGroupRepo.deleteEmailGroup(emailGroupId);

            logger.info(`Email group ${emailGroupId} deleted successfully`);
            return { deleted };

        } catch (error) {
            logger.error(`Error deleting email group ${emailGroupId}:`, error);
            throw error;
        }
    }

   async deleteEmailGroupSummary(emailGroupId: string): Promise<IEmailGroup> {
    const emailGroup = await this.emailGroupRepo.getEmailGroupByEmailGroupId(emailGroupId);

    if (!emailGroup) {
        throw new Error('Email group not found');
    }

    const allSummaries = await this.summaryService.getSummariesByEmailGroupId(emailGroupId);
    for (const summary of allSummaries) {
        await this.summaryRepo.deleteSummary(summary.summaryId);
        logger.info(`Summary deleted: ${summary.summaryId} (status: ${summary.status})`);
    }

    await this.emailRepo.updateEmailsStatusByGroup(emailGroupId, 'not_processed');
    logger.info(`All emails in group ${emailGroupId} set to not_processed status`);

    const updatedGroup = await this.emailGroupRepo.getEmailGroupByEmailGroupId(emailGroupId);
    if (!updatedGroup) {
        throw new Error('Failed to retrieve updated email group');
    }

    logger.info(`All summaries removed from email group: ${emailGroupId}, emails reset to not_processed`);
    return updatedGroup;
}

    async approveEmailGroup(emailGroupId: string): Promise<{ emailGroupId: string; status: string }> {
        try {
            logger.info('Approving email group:', { emailGroupId });

            const emailGroup = await this.emailGroupRepo.getEmailGroupByEmailGroupId(emailGroupId);
            if (!emailGroup) {
                throw new Error('Email group not found');
            }

            const activeSummary = await this.summaryService.getActiveSummaryByEmailGroupId(emailGroupId);
            if (!activeSummary) {
                throw new Error('Email group does not have AI analysis to approve');
            }

            if (activeSummary.status === 'approved') {
                logger.info(`Email group ${emailGroupId} is already approved`);
                return { emailGroupId, status: 'approved' };
            }

            await this.summaryService.approveSummary(activeSummary.summaryId);

            const deletedCount = await this.summaryService.deleteOldApprovedRejectedSummaries(
                emailGroupId,
                activeSummary.summaryId
            );
            logger.info(`Deleted ${deletedCount} old approved/rejected summaries for group ${emailGroupId}`);

            await this.emailGroupRepo.saveEmailGroup({
                emailGroupId: emailGroup.emailGroupId,
                userId: emailGroup.userId,
                updatedAt: new Date()
            });

            const updatedEmailGroup = await this.emailGroupRepo.getEmailGroupByEmailGroupId(emailGroupId);
            if (updatedEmailGroup) {
                this.wsService.sendApprovedSummary(updatedEmailGroup);
                this.sseService.sendApprovedSummary(updatedEmailGroup);
            }

            logger.info(`Email group ${emailGroupId} approved`);
            return { emailGroupId, status: 'approved' };
        } catch (error) {
            logger.error('Error in approveEmailGroup:', error);
            throw error;
        }
    }

    async rejectEmailGroup(emailGroupId: string): Promise<{ emailGroupId: string; status: string }> {
        try {
            logger.info('Rejecting email group:', { emailGroupId });

            const emailGroup = await this.emailGroupRepo.getEmailGroupByEmailGroupId(emailGroupId);
            if (!emailGroup) {
                throw new Error('Email group not found');
            }

            const activeSummary = await this.summaryService.getActiveSummaryByEmailGroupId(emailGroupId);
            if (!activeSummary) {
                throw new Error('Email group does not have AI analysis to reject');
            }

            if (activeSummary.status === 'rejected') {
                logger.info(`Email group ${emailGroupId} is already rejected`);
                return { emailGroupId, status: 'rejected' };
            }

            await this.summaryService.rejectSummary(activeSummary.summaryId);

            const deletedCount = await this.summaryService.deleteOldApprovedRejectedSummaries(
                emailGroupId,
                activeSummary.summaryId
            );
            logger.info(`Deleted ${deletedCount} old approved/rejected summaries for group ${emailGroupId}`);

            await this.emailGroupRepo.saveEmailGroup({
                emailGroupId: emailGroup.emailGroupId,
                userId: emailGroup.userId,
                updatedAt: new Date()
            });

            logger.info(`Email group ${emailGroupId} rejected`);
            return { emailGroupId, status: 'rejected' };
        } catch (error) {
            logger.error('Error in rejectEmailGroup:', error);
            throw error;
        }
    }

    private async getEmailStats(): Promise<{ new: number; processing: number; processed: number; failed: number; total: number }> {
        const allEmails = await this.emailRepo.getAllEmails();
        const total = allEmails.length;

        const newCount = allEmails.filter(email => email.status === 'not_processed').length;
        const processingCount = allEmails.filter(email => email.status === 'processing').length;
        const processedCount = allEmails.filter(email => email.status === 'processed').length;
        const failedCount = allEmails.filter(email => email.status === 'failed').length;

        return {
            new: newCount,
            processing: processingCount,
            processed: processedCount,
            failed: failedCount,
            total
        };
    }
}