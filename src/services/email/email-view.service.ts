import { IEmail } from "@/models/email";
import { EmailRepository } from "@/repositories";

export class EmailViewService {
    constructor(private emailRepo: EmailRepository) {}

    async handlePostSyncState(): Promise<{ newEmailIds: string[] }> {
        const newEmails = await this.emailRepo.getNotProcessedEmails();
        const newEmailIds = newEmails.map(email => email.id);

        return { newEmailIds };
    }

    async markAsProcessed(emailId: string): Promise<void> {
        await this.emailRepo.updateEmailStatus(emailId, 'processed');
    }

    async getEmailStats(): Promise<{
        new: number;
        processing: number;
        processed: number;
        failed: number;
        total: number;
    }> {
        const [newCount, processingCount, processedCount, failedCount, total] = await Promise.all([
            this.emailRepo.getEmailsCountByStatus('not_processed'),
            this.emailRepo.getEmailsCountByStatus('processing'),
            this.emailRepo.getEmailsCountByStatus('processed'),
            this.emailRepo.getEmailsCountByStatus('failed'),
            this.emailRepo.getTotalEmailsCount()
        ]);

        return {
            new: newCount,
            processing: processingCount,
            processed: processedCount,
            failed: failedCount,
            total
        };
    }

    async getNotProcessedEmails(): Promise<IEmail[]> {
        return this.emailRepo.getNotProcessedEmails();
    }
}