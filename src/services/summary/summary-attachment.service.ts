import { EmailRepository } from '@/repositories';
import { IEmailAttachment } from '@/models/attachment';
import { logger } from '@/utils';

export class SummaryAttachmentService {
    constructor(private emailRepo: EmailRepository) {}

    async getSummaryAttachments(emailGroupId: string): Promise<IEmailAttachment[]> {
        try {
            const emails = await this.emailRepo.getEmailsByEmailGroupId(emailGroupId);
            const allAttachments: IEmailAttachment[] = [];

            for (const email of emails) {
                if (email.attachments && email.attachments.length > 0) {
                    allAttachments.push(...email.attachments);
                }
            }

            logger.info(`Found ${allAttachments.length} attachments for summary of group ${emailGroupId}`);
            return allAttachments;
        } catch (error) {
            logger.error('Error getting summary attachments:', error);
            throw error;
        }
    }

    async getSummaryAttachmentsBySummaryId(summaryId: string, emailGroupRepo: any): Promise<IEmailAttachment[]> {
        try {
            const emailGroup = await emailGroupRepo.getEmailGroupBySummaryId(summaryId);
            if (!emailGroup) {
                return [];
            }

            return this.getSummaryAttachments(emailGroup.emailGroupId);
        } catch (error) {
            logger.error('Error getting summary attachments by summaryId:', error);
            throw error;
        }
    }
}