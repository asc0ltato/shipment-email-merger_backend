import { Sequelize } from 'sequelize';
import { initModels, Models } from '@/models';
import { IEmailAttachment } from '@/models/attachment';
import { logger } from '@/utils';

export class AttachmentRepository {
    private models: Models;

    constructor(sequelize: Sequelize) {
        this.models = initModels(sequelize);
    }

    async getTotalAttachmentsCount(): Promise<number> {
        try {
            return await this.models.Attachment.count();
        } catch (error) {
            logger.error('Error getting total attachments count:', error);
            return 0;
        }
    }

    async getAttachmentsByEmailGroupId(emailGroupId: string): Promise<IEmailAttachment[]> {
        try {
            const attachments = await this.models.Attachment.findAll({
                include: [{
                    model: this.models.Email,
                    as: 'email',
                    where: { emailGroupId },
                    attributes: []
                }]
            });

            return attachments.map(attachment => ({
                id: attachment.id,
                emailId: attachment.emailId,
                filename: attachment.filename,
                content: attachment.content,
                contentType: attachment.contentType,
                size: attachment.size
            }));
        } catch (error) {
            logger.error('Error in getAttachmentsByEmailGroupId:', error);
            throw error;
        }
    }

    async getAttachmentByFilename(emailGroupId: string, filename: string): Promise<IEmailAttachment | null> {
        try {
            const attachment = await this.models.Attachment.findOne({
                where: { filename },
                include: [{
                    model: this.models.Email,
                    as: 'email',
                    where: { emailGroupId },
                    attributes: []
                }]
            });

            if (attachment) {
                return {
                    id: attachment.id,
                    emailId: attachment.emailId,
                    filename: attachment.filename,
                    content: attachment.content,
                    contentType: attachment.contentType,
                    size: attachment.size
                };
            }

            return null;
        } catch (error) {
            logger.error('Error in getAttachmentByFilename:', error);
            throw error;
        }
    }
}