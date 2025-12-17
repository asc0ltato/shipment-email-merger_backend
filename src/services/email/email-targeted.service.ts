import { EmailFetcherService } from './email-fetcher.service';
import { EmailBaseService } from './email-base.service';
import { EmailRepository } from '@/repositories';
import { IEmailGroup } from '@/models/email-group';
import { logger } from '@/utils';

export class EmailTargetedService {
    constructor(
        private emailBaseService: EmailBaseService,
        private emailRepo: EmailRepository
    ) {}

    async findAndSyncEmailsByGroupId(
        emailFetcher: EmailFetcherService,
        emailGroupId: string,
        userId?: number
    ): Promise<{ group: IEmailGroup | null; newEmails: number; created: boolean }> {
        try {
            logger.info(`Starting targeted search for email group: ${emailGroupId}`);

            const { EmailProcessorService } = await import('./email-processor.service');
            const emailProcessor = new EmailProcessorService(emailFetcher);

            const { emailGroups, parsedEmails } = await emailProcessor.getGroupedEmailGroupsByEmailGroupId(emailGroupId);

            if (emailGroups.length === 0) {
                logger.info(`No email groups found for: ${emailGroupId}`);
                return { group: null, newEmails: 0, created: false };
            }

            const emailGroup = emailGroups[0];
            const saveResult = await this.processEmailGroup(emailGroup, parsedEmails, emailGroupId, userId);

            return saveResult;

        } catch (error) {
            logger.error(`Error in targeted search for ${emailGroupId}:`, error);
            throw error;
        }
    }

    private async processEmailGroup(
        emailGroup: IEmailGroup,
        parsedEmails: any[],
        emailGroupId: string,
        userId?: number
    ): Promise<{ group: IEmailGroup | null; newEmails: number; created: boolean }> {
        logger.info(`Processing email group: ${emailGroup.emailGroupId}`);

        const existingGroup = await this.emailBaseService.getEmailGroupRepository().getEmailGroupByEmailGroupId(emailGroupId);

        let saveResult: { created: boolean; summaryId: string | null };

        if (existingGroup) {
            emailGroup.updatedAt = existingGroup.updatedAt;
            const summaryId = existingGroup.summary?.summaryId || null;
            saveResult = { created: false, summaryId };

            logger.info(`Updating existing email group: ${emailGroupId}`);
        } else {
            saveResult = await this.emailBaseService.saveEmailGroupWithSummary({
                emailGroupId: emailGroup.emailGroupId,
                userId
            });
            logger.info(`Created new email group: ${emailGroupId}`);
        }

        logger.info(`Group save result: created=${saveResult.created}`);

        const groupParsedEmails = this.filterEmailsForGroup(parsedEmails, emailGroupId);
        const newEmailsCount = await this.emailRepo.saveEmailsWithAttachments(emailGroupId, groupParsedEmails);

        logger.info(`Saved ${newEmailsCount} emails with attachments for group ${emailGroupId}`);

        const updatedGroup = await this.emailBaseService.refreshEmailGroupEmails(emailGroupId);
        logger.info(`Retrieved updated group with ${updatedGroup?.emails?.length || 0} emails`);

        return {
            group: updatedGroup,
            newEmails: newEmailsCount,
            created: saveResult.created
        };
    }

    private filterEmailsForGroup(parsedEmails: any[], emailGroupId: string): any[] {
        const filteredEmails = parsedEmails.filter(parsed =>
            parsed.dbData.emailGroupId === emailGroupId
        );

        logger.info(`Filtered ${filteredEmails.length} emails for group ${emailGroupId}`);
        return filteredEmails;
    }
}