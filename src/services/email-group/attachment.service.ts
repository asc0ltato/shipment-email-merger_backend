import { AttachmentRepository } from '@/repositories';
import { IEmailAttachment } from '@/models/attachment';
import { logger } from '@/utils';

export class AttachmentService {
    constructor(
        private attachmentRepo: AttachmentRepository
    ) {}

    async downloadAttachment(emailGroupId: string, filename: string): Promise<{ attachment: IEmailAttachment }> {
        logger.info('Downloading attachment:', { emailGroupId, filename });

        if (!emailGroupId) {
            throw new Error('Email group ID is required');
        }

        if (!filename) {
            throw new Error('Filename is required');
        }

        const attachment = await this.attachmentRepo.getAttachmentByFilename(emailGroupId, filename);

        if (!attachment) {
            throw new Error(`Attachment ${filename} not found for email group ${emailGroupId}`);
        }

        return { attachment };
    }

    async getAttachmentInfo(emailGroupId: string): Promise<{ attachments: IEmailAttachment[] }> {
        logger.info('Getting attachment info:', { emailGroupId });

        if (!emailGroupId) {
            throw new Error('Email group ID is required');
        }

        const attachments = await this.attachmentRepo.getAttachmentsByEmailGroupId(emailGroupId);
        return { attachments };
    }
}