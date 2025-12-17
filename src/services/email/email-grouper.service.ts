import { IEmail } from '@/models/email';
import { IEmailGroup } from '@/models/email-group';
import { logger } from '@/utils';
import { EmailGroupId } from '@/utils/email-group-id';

export class EmailGrouperService {
    private emailGroupIdService: EmailGroupId;

    constructor() {
        this.emailGroupIdService = new EmailGroupId();
    }

    groupEmailsByEmailGroup(emails: IEmail[]): IEmailGroup[] {
        logger.info(`Starting smart grouping for ${emails.length} emails`);

        // Нормализация существующих групп
        const normalizedGroups = this.normalizeEmailGroups(emails);

        // Обработка несгруппированных писем
        const ungroupedEmails = emails.filter(email =>
            !email.emailGroupId || email.emailGroupId === 'unknown'
        );
        this.processUngroupedEmails(ungroupedEmails, normalizedGroups);

        // Создание финальных групп
        const emailGroups = this.createFinalEmailGroups(normalizedGroups);

        logger.info(`Smart grouping completed: ${emailGroups.length} email groups created`);
        return emailGroups;
    }

    private normalizeEmailGroups(emails: IEmail[]): Map<string, IEmail[]> {
        const normalizedGroups = new Map<string, IEmail[]>();
        const idVariations = new Map<string, string>();

        emails.forEach(email => {
            if (!email.emailGroupId || email.emailGroupId === 'unknown') {
                return;
            }

            const normalizedId = this.emailGroupIdService.normalizeEmailGroupId(email.emailGroupId);
            if (!normalizedId || normalizedId.length < 6) {
                logger.warn(`Invalid email group ID format: ${email.emailGroupId}`);
                return;
            }

            if (!normalizedGroups.has(normalizedId)) {
                normalizedGroups.set(normalizedId, []);
            }
            normalizedGroups.get(normalizedId)!.push(email);
            idVariations.set(email.emailGroupId, normalizedId);

            logger.debug(`Normalized ${email.emailGroupId} -> ${normalizedId}`);
        });

        return normalizedGroups;
    }

    private processUngroupedEmails(ungroupedEmails: IEmail[], normalizedGroups: Map<string, IEmail[]>): void {
        if (ungroupedEmails.length === 0) return;

        logger.info(`Attempting fuzzy matching for ${ungroupedEmails.length} emails without email group IDs`);

        ungroupedEmails.forEach(email => {
            const potentialId = this.extractEmailGroupIdFromContent(email);
            if (!potentialId) {
                logger.debug(`No email group ID found in email: "${email.subject}"`);
                return;
            }

            const normalizedPotentialId = this.emailGroupIdService.normalizeEmailGroupId(potentialId);
            if (!normalizedPotentialId || normalizedPotentialId.length < 6) {
                logger.warn(`Invalid potential email group ID: ${potentialId}`);
                return;
            }

            this.assignEmailToGroup(email, normalizedPotentialId, normalizedGroups);
        });
    }

    private assignEmailToGroup(email: IEmail, potentialId: string, normalizedGroups: Map<string, IEmail[]>): void {
        const bestMatch = this.emailGroupIdService.findBestFuzzyMatch(
            potentialId,
            Array.from(normalizedGroups.keys()),
            this.getSimilarityThreshold()
        );

        if (bestMatch) {
            normalizedGroups.get(bestMatch)!.push(email);
            logger.info(`Fuzzy matched email "${email.subject}" to email group ${bestMatch} (from: ${potentialId})`);
        } else {
            normalizedGroups.set(potentialId, [email]);
            logger.info(`Created new email group from fuzzy match: ${potentialId}`);
        }
    }

    private createFinalEmailGroups(normalizedGroups: Map<string, IEmail[]>): IEmailGroup[] {
        const emailGroups: IEmailGroup[] = [];

        for (const [emailGroupId, emailList] of normalizedGroups.entries()) {
            if (emailList.length >= 1) {
                const emailGroup = this.createEmailGroup(emailGroupId, emailList);
                emailGroups.push(emailGroup);
                logger.info(`Created email group ${emailGroupId} with ${emailList.length} emails`);
            }
        }

        return emailGroups.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    private createEmailGroup(emailGroupId: string, emailList: IEmail[]): IEmailGroup {
        const dates = emailList.map(e => e.date).sort((a, b) => a.getTime() - b.getTime());

        return {
            emailGroupId,
            createdAt: dates[0],
            updatedAt: dates[dates.length - 1]
        } as IEmailGroup;
    }

    public extractEmailGroupIdFromContent(email: IEmail): string | null {
        const searchText = `${email.subject} ${email.text || ''}`.toLowerCase();
        return this.emailGroupIdService.extractEmailGroupIdFromText(searchText);
    }

    private getSimilarityThreshold(): number {
        return 0.8;
    }
}