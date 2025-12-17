import { IParsedEmail, IEmail } from '@/models/email';
import { IEmailGroup } from '@/models/email-group';
import { EmailFetcherService, FetchedEmail } from './email-fetcher.service';
import { EmailParserService } from './email-parser.service';
import { EmailGrouperService } from './email-grouper.service';
import { EmailGroupRepository } from '@/repositories/email-group.repository';
import { logger } from '@/utils';

export interface ProcessResult {
    emails: IEmail[];
    emailGroups: IEmailGroup[];
    parsedEmails: IParsedEmail[];
}

export class EmailProcessorService {
    private emailParser: EmailParserService;
    private emailGrouper: EmailGrouperService;
    private emailGroupRepo: EmailGroupRepository | null = null;

    constructor(
        private emailFetcher: EmailFetcherService,
        emailGroupRepo?: EmailGroupRepository
    ) {
        this.emailParser = new EmailParserService();
        this.emailGrouper = new EmailGrouperService();
        this.emailGroupRepo = emailGroupRepo || null;
    }

    async getGroupedEmailGroups(options: {
        startDate?: string;
        endDate?: string;
        days?: number;
    } = {}): Promise<ProcessResult> {
        logger.info('Starting email data processing with smart grouping');

        try {
        await this.emailFetcher.connect();

        const initialRawEmails = await this.emailFetcher.fetchEmailsFilteredByEmailGroupId(options);
        logger.info(`Received ${initialRawEmails.length} filtered raw emails with email group IDs`);

        const targetEmailGroupIds = await this.extractEmailGroupIdsFromFetched(initialRawEmails);
        
        if (this.emailGroupRepo) {
            try {
                const existingGroups = await this.emailGroupRepo.getAllEmailGroups();
                existingGroups.forEach((group: IEmailGroup) => {
                    if (group.emailGroupId) {
                        targetEmailGroupIds.add(group.emailGroupId);
                    }
                });
                logger.info(`Added ${existingGroups.length} existing groups from database for extended search`);
            } catch (error) {
                logger.warn('Could not fetch existing groups for extended search:', error);
            }
        }
        
   
        if (targetEmailGroupIds.size === 0) {
            logger.info('No email groups found for processing');
            return { emails: [], emailGroups: [], parsedEmails: [] };
        }
        
        const extendedEmails = await this.fetchExtendedEmails(targetEmailGroupIds);
        
        logger.info(`Extended search found ${extendedEmails.length} additional emails for ${targetEmailGroupIds.size} groups`);

        const finalRawEmails = this.mergeFetchedEmails(initialRawEmails, extendedEmails);
        const parsedEmails = await this.parseFetchedEmails(finalRawEmails);

        // Группировка
        const emailsForGrouping: IEmail[] = parsedEmails.map(parsedEmail => ({
            ...parsedEmail.dbData
        }));

        const emailGroups = this.emailGrouper.groupEmailsByEmailGroup(emailsForGrouping);
        logger.info(`Smart grouping created ${emailGroups.length} email group groups`);

        return {
            emails: emailsForGrouping,
            emailGroups,
            parsedEmails
        };
        } finally {
            await this.emailFetcher.safeDisconnect();
        }
    }

    private async extractEmailGroupIdsFromFetched(fetchedEmails: FetchedEmail[]): Promise<Set<string>> {
        const emailGroupIds = new Set<string>();

        for (const fetchedEmail of fetchedEmails) {
            const potentialId = this.emailGrouper.extractEmailGroupIdFromContent({
                subject: fetchedEmail.subject,
                text: fetchedEmail.text
            } as IEmail);

            if (potentialId) {
                emailGroupIds.add(potentialId);
            }
        }

        return emailGroupIds;
    }

    private async fetchExtendedEmails(emailGroupIds: Set<string>): Promise<FetchedEmail[]> {
        const allExtendedEmails: FetchedEmail[] = [];

        for (const emailGroupId of emailGroupIds) {
            try {
                const emailsForEmailGroup = await this.emailFetcher.fetchEmailsByEmailGroupId(emailGroupId);
                allExtendedEmails.push(...emailsForEmailGroup);
                logger.info(`Found ${emailsForEmailGroup.length} emails for email group ${emailGroupId}`);
            } catch (error) {
                logger.error(`Error fetching emails for email group ${emailGroupId}:`, error);
            }
        }

        return allExtendedEmails;
    }

    private async parseFetchedEmails(fetchedEmails: FetchedEmail[]): Promise<IParsedEmail[]> {
        const parsedEmails: IParsedEmail[] = [];
        const emailsForParsing = this.convertFetchedToParsedFormat(fetchedEmails);

        logger.info(`Starting to parse ${emailsForParsing.length} emails`);

        for (const rawEmail of emailsForParsing) {
            const parsed = await this.emailParser.parseEmail(rawEmail);
            if (parsed && this.emailParser.isRelevantEmail(parsed)) {
                parsedEmails.push(parsed);
            }
        }

        logger.info(`Successfully parsed ${parsedEmails.length} relevant emails`);
        return parsedEmails;
    }

    private convertFetchedToParsedFormat(fetchedEmails: FetchedEmail[]): any[] {
        return fetchedEmails.map(fetchedEmail => ({
            messageId: fetchedEmail.id,
            subject: fetchedEmail.subject,
            from: { text: fetchedEmail.from },
            to: { text: fetchedEmail.to },
            date: fetchedEmail.date,
            text: fetchedEmail.text,
            attachments: fetchedEmail.attachments.map(att => ({
                filename: att.filename,
                content: att.content,
                contentType: att.contentType
            }))
        }));
    }

    private mergeFetchedEmails(initialEmails: FetchedEmail[], extendedEmails: FetchedEmail[]): FetchedEmail[] {
        const allEmailsMap = new Map<string, FetchedEmail>();

        extendedEmails.forEach(email => {
            if (email.id) {
                allEmailsMap.set(email.id, email);
            }
        });

        initialEmails.forEach(email => {
            if (email.id) {
                allEmailsMap.set(email.id, email);
            }
        });

        const mergedEmails = Array.from(allEmailsMap.values());
        logger.info(`Total unique emails after extended search: ${mergedEmails.length}`);
        return mergedEmails;
    }

    async getGroupedEmailGroupsByEmailGroupId(emailGroupId: string): Promise<ProcessResult> {
        logger.info(`Starting targeted search for email group: ${emailGroupId}`);

        try {
        await this.emailFetcher.connect();

        const fetchedEmails = await this.emailFetcher.fetchEmailsByEmailGroupId(emailGroupId);
        logger.info(`Found ${fetchedEmails.length} raw emails for email group ${emailGroupId}`);

        const emailsForParsing = this.convertFetchedToParsedFormat(fetchedEmails);

        const parsedEmails: IParsedEmail[] = [];
        for (const rawEmail of emailsForParsing) {
            const parsed = await this.emailParser.parseEmail(rawEmail);
            if (parsed && this.emailParser.isRelevantEmail(parsed)) {
                parsedEmails.push(parsed);
            }
        }

        logger.info(`Parsed ${parsedEmails.length} relevant emails for email group ${emailGroupId}`);

        const emailsForGrouping: IEmail[] = parsedEmails.map(parsedEmail => ({
            ...parsedEmail.dbData
        }));

        const emailGroups = this.emailGrouper.groupEmailsByEmailGroup(emailsForGrouping);
        const filteredEmailGroups = emailGroups.filter(s =>
            s.emailGroupId.toUpperCase().includes(emailGroupId.toUpperCase())
        );

        logger.info(`Created ${filteredEmailGroups.length} email group groups for "${emailGroupId}"`);

        return {
            emails: emailsForGrouping,
            emailGroups: filteredEmailGroups,
            parsedEmails
        };
        } finally {
            await this.emailFetcher.safeDisconnect();
        }
    }
}