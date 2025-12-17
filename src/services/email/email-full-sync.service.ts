import { EmailFetcherService } from './email-fetcher.service';
import { EmailBaseService } from './email-base.service';
import { logger } from '@/utils';

export class EmailFullSyncService {
    constructor(private emailBaseService: EmailBaseService) {}

    async syncAllEmails(
        emailFetcher: EmailFetcherService,
        options: { startDate?: string; endDate?: string } = {},
        userId?: number
    ): Promise<{
        created: number;
        updated: number;
        newEmails: number;
        createdGroups: string[];
        updatedGroups: string[];
    }> {
        try {
            logger.info('Starting full email sync', { options, userId });

            const { EmailProcessorService } = await import('./email-processor.service');
            const emailGroupRepo = this.emailBaseService.getEmailGroupRepository();
            const emailProcessor = new EmailProcessorService(emailFetcher, emailGroupRepo);

            const { emails, emailGroups, parsedEmails } = await emailProcessor.getGroupedEmailGroups(options);

            logger.info(`Found ${emailGroups.length} email groups with ${emails.length} emails`);

            const syncResult = await this.processAllEmailGroups(emailGroups, parsedEmails, userId);

            logger.info('Full email sync completed', syncResult);
            return syncResult;

        } catch (error) {
            logger.error('Error in full email sync:', error);
            throw error;
        }
    }

    private async processAllEmailGroups(
        emailGroups: any[],
        parsedEmails: any[],
        userId?: number
    ): Promise<{
        created: number;
        updated: number;
        newEmails: number;
        createdGroups: string[];
        updatedGroups: string[];
    }> {
        let createdCount = 0;
        let updatedCount = 0;
        let totalNewEmails = 0;
        const createdGroupIds: string[] = [];
        const updatedGroupIds: string[] = [];

        for (const emailGroup of emailGroups) {
            try {
                if (!emailGroup.emailGroupId) {
                    logger.warn('Skipping email group without ID');
                    continue;
                }

                const groupResult = await this.processSingleEmailGroup(emailGroup, parsedEmails, userId);

                if (groupResult.created) {
                    createdCount++;
                    createdGroupIds.push(emailGroup.emailGroupId);
                } else {
                    updatedCount++;
                    updatedGroupIds.push(emailGroup.emailGroupId);
                }

                totalNewEmails += groupResult.newEmails;
                logger.debug(`Processed group ${emailGroup.emailGroupId}: ${groupResult.newEmails} new emails`);

            } catch (error) {
                logger.error(`Error processing email group ${emailGroup.emailGroupId}:`, error);
            }
        }

        return {
            created: createdCount,
            updated: updatedCount,
            newEmails: totalNewEmails,
            createdGroups: createdGroupIds,
            updatedGroups: updatedGroupIds
        };
    }

    private async processSingleEmailGroup(
        emailGroup: any,
        parsedEmails: any[],
        userId?: number
    ): Promise<{ created: boolean; newEmails: number }> {
        const saveResult = await this.emailBaseService.saveEmailGroupWithSummary({
            emailGroupId: emailGroup.emailGroupId,
            userId
        });

        const groupParsedEmails = parsedEmails.filter(parsed =>
            parsed.dbData.emailGroupId === emailGroup.emailGroupId
        );

        const newEmailsCount = await this.emailBaseService.saveOnlyNewEmails(
            emailGroup.emailGroupId,
            groupParsedEmails
        );

        return {
            created: saveResult.created,
            newEmails: newEmailsCount
        };
    }

    async syncRecentEmails(
        emailFetcher: EmailFetcherService,
        userId?: number,
        days: number = 1
    ): Promise<{ created: number; updated: number; newEmails: number; createdGroups: string[]; updatedGroups: string[] }> {
        try {
            const { startDateStr, endDateStr } = this.getDateRange(days);

            logger.info(`Syncing recent emails (last ${days} days)`, { startDateStr, endDateStr, userId });

            return await this.syncAllEmails(
                emailFetcher,
                { startDate: startDateStr, endDate: endDateStr },
                userId
            );
        } catch (error) {
            logger.error('Error syncing recent emails:', error);
            throw error;
        }
    }

    private getDateRange(days: number): { startDateStr: string; endDateStr: string } {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        return {
            startDateStr: this.formatDate(startDate),
            endDateStr: this.formatDate(endDate)
        };
    }

    private formatDate(date: Date): string {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }
}