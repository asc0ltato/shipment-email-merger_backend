import { EmailGroupRepository, EmailRepository, SummaryRepository } from '@/repositories';
import { IParsedEmail } from '@/models/email';
import { IEmailGroup } from '@/models/email-group';
import { logger } from '@/utils';

export class EmailBaseService {
    constructor(
        private emailGroupRepo: EmailGroupRepository,
        private emailRepo: EmailRepository,
        private summaryRepo: SummaryRepository
    ) {}

    getEmailGroupRepository(): EmailGroupRepository {
        return this.emailGroupRepo;
    }

    async saveEmailGroupWithSummary(emailGroupData: {
        emailGroupId: string;
        userId?: number;
    }): Promise<{ created: boolean; summaryId: string | null }> {
        try {
            const existingGroup = await this.emailGroupRepo.getEmailGroupByEmailGroupId(emailGroupData.emailGroupId);

            if (existingGroup) {
                const summaryId = existingGroup.summary?.summaryId || null;
                return { created: false, summaryId };
            } else {
                const emailGroup = await this.emailGroupRepo.createEmailGroup(
                    emailGroupData.emailGroupId,
                    emailGroupData.userId
                );

                logger.info(`Created new email group: ${emailGroupData.emailGroupId}`);
                return { created: true, summaryId: null };
            }
        } catch (error) {
            logger.error(`Error saving email group ${emailGroupData.emailGroupId}:`, error);
            throw error;
        }
    }

    private async updateExistingGroup(existingGroup: IEmailGroup, newData: any): Promise<void> {
        const updatedAt = new Date();

        await this.emailGroupRepo.saveEmailGroup({
            emailGroupId: existingGroup.emailGroupId,
            userId: newData.userId !== undefined ? newData.userId : existingGroup.userId,
            updatedAt
        });

        logger.info(`Updated existing email group: ${existingGroup.emailGroupId}`);
    }

    async saveOnlyNewEmails(emailGroupId: string, parsedEmails: IParsedEmail[]): Promise<number> {
        try {
            let savedCount = 0;

            for (const parsedEmail of parsedEmails) {
                try {
                    const isNewEmail = await this.saveSingleEmailIfNew(emailGroupId, parsedEmail);
                    if (isNewEmail) {
                        savedCount++;
                    }
                } catch (error: any) {
                    logger.error(`Error saving email ${parsedEmail.dbData.id}:`, error);
                }
            }

            if (savedCount > 0) {
                await this.updateGroupTimestamp(emailGroupId);
            }

            logger.info(`Saved ${savedCount} NEW emails for group: ${emailGroupId}`);
            return savedCount;
        } catch (error) {
            logger.error(`Error saving emails for group ${emailGroupId}:`, error);
            throw error;
        }
    }

    private async updateGroupTimestamp(emailGroupId: string): Promise<void> {
        try {
            const existingGroup = await this.emailGroupRepo.getEmailGroupByEmailGroupId(emailGroupId);
            if (existingGroup) {
                await this.emailGroupRepo.saveEmailGroup({
                    emailGroupId: existingGroup.emailGroupId,
                    userId: existingGroup.userId,
                    updatedAt: new Date()
                });
                logger.debug(`Updated timestamp for group: ${emailGroupId}`);
            }
        } catch (error) {
            logger.error(`Error updating timestamp for group ${emailGroupId}:`, error);
        }
    }

    private async saveSingleEmailIfNew(emailGroupId: string, parsedEmail: IParsedEmail): Promise<boolean> {
        const existingEmail = await this.emailRepo.getEmailByMessageId(parsedEmail.dbData.id);

        if (!existingEmail) {
            parsedEmail.dbData.status = 'not_processed';
            const saved = await this.emailRepo.saveEmailsWithAttachments(emailGroupId, [parsedEmail]);
            if (saved > 0) {
                logger.debug(`Saved NEW email: ${parsedEmail.dbData.id} for group: ${emailGroupId}`);
                return true;
            }
        } else {
            logger.debug(`Email already exists: ${parsedEmail.dbData.id}, keeping status: ${existingEmail.status}`);
        }

        return false;
    }

    async refreshEmailGroupEmails(emailGroupId: string): Promise<IEmailGroup | null> {
        try {
            const group = await this.emailGroupRepo.getEmailGroupByEmailGroupId(emailGroupId);
            logger.debug(`Refreshed email group: ${emailGroupId}`);
            return group;
        } catch (error) {
            logger.error(`Error refreshing email group ${emailGroupId}:`, error);
            throw error;
        }
    }

    async getUpdatedEmailGroup(emailGroupId: string): Promise<IEmailGroup | null> {
        try {
            const group = await this.emailGroupRepo.getEmailGroupByEmailGroupId(emailGroupId);
            if (group) {
                logger.info(`Retrieved updated group ${emailGroupId} with ${group.emails?.length || 0} emails`);
            }
            return group;
        } catch (error) {
            logger.error(`Error getting updated group ${emailGroupId}:`, error);
            throw error;
        }
    }

    async getAllEmailGroupsWithEmails(): Promise<IEmailGroup[]> {
        try {
            const groups = await this.emailGroupRepo.getAllEmailGroups();
            logger.debug(`Retrieved ${groups.length} email groups with emails`);
            return groups;
        } catch (error) {
            logger.error('Error getting all email groups:', error);
            throw error;
        }
    }

    async updateEmailStatusForGroup(emailGroupId: string, status: 'not_processed' | 'processing' | 'processed' | 'failed'): Promise<number> {
        try {
            const updatedCount = await this.emailRepo.updateEmailsStatusByGroup(emailGroupId, status);
            logger.info(`Updated ${updatedCount} emails in group ${emailGroupId} to status: ${status}`);
            return updatedCount;
        } catch (error) {
            logger.error(`Error updating email status for group ${emailGroupId}:`, error);
            throw error;
        }
    }
}