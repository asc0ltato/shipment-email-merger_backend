import { Sequelize } from 'sequelize';
import { initModels, Models } from '@/models';
import { IEmail, IParsedEmail } from '@/models/email';
import { IEmailAttachment } from '@/models/attachment';
import { logger } from '@/utils';

export class EmailRepository {
    private models: Models;
    private sequelize: Sequelize;

    constructor(sequelize: Sequelize) {
        this.sequelize = sequelize;
        this.models = initModels(sequelize);
    }

    async saveEmailsWithAttachments(emailGroupId: string, parsedEmails: IParsedEmail[]): Promise<number> {
        const transaction = await this.sequelize.transaction();
        
        try {
            let savedCount = 0;
            let totalAttachments = 0;

            logger.info(`Saving ${parsedEmails.length} emails for group: ${emailGroupId}`);

            for (const parsedEmail of parsedEmails) {
                try {
                    const existingEmail = await this.getEmailByMessageId(parsedEmail.dbData.id);

                    if (!existingEmail) {
                        const emailData = {
                            id: parsedEmail.dbData.id,
                            from: parsedEmail.dbData.from,
                            to: parsedEmail.dbData.to,
                            subject: parsedEmail.dbData.subject,
                            date: parsedEmail.dbData.date,
                            emailGroupId: emailGroupId,
                            status: 'not_processed' as const,
                            text: parsedEmail.uiData.text,
                        };

                        const [savedEmail, created] = await this.models.Email.upsert(emailData, {
                            returning: true,
                            transaction
                        });

                        if (created) {
                            savedCount++;
                            logger.info(`Email saved: ${parsedEmail.dbData.id}`);

                            if (parsedEmail.uiData.attachments?.length > 0) {
                                const attachmentCount = await this.saveAttachmentsForEmail(
                                    savedEmail.id, 
                                    parsedEmail.uiData.attachments,
                                    transaction
                                );
                                totalAttachments += attachmentCount;
                                logger.info(`Saved ${attachmentCount} attachments for new email: ${parsedEmail.dbData.id}`);
                            }
                        }
                    } else {
                        logger.debug(`Email already exists: ${parsedEmail.dbData.id}, status: ${existingEmail.status}`);
                        
                        if (parsedEmail.uiData.attachments?.length > 0) {
                            const attachmentCount = await this.saveNewAttachmentsForEmail(
                                parsedEmail.dbData.id,
                                parsedEmail.uiData.attachments,
                                transaction
                            );
                            if (attachmentCount > 0) {
                                logger.info(`Saved ${attachmentCount} new attachments for existing email: ${parsedEmail.dbData.id}`);
                                totalAttachments += attachmentCount;
                            } else {
                                logger.debug(`No new attachments to save for existing email: ${parsedEmail.dbData.id}`);
                            }
                        } else {
                            logger.debug(`No attachments to save for existing email: ${parsedEmail.dbData.id}`);
                        }
                    }

                } catch (error: any) {
                    logger.error(`Error saving email ${parsedEmail.dbData.id}:`, error);
                }
            }

            await transaction.commit();
            logger.info(`Saved ${savedCount} emails with ${totalAttachments} attachments for group: ${emailGroupId}`);
            return savedCount;
        } catch (error) {
            await transaction.rollback();
            logger.error('Error in saveEmailsWithAttachments:', error);
            throw error;
        }
    }

    private async saveAttachmentsForEmail(
        emailId: string, 
        attachments: IEmailAttachment[], 
        transaction?: any
    ): Promise<number> {
        let savedCount = 0;
        
        try {
            logger.info(`Saving ${attachments.length} attachments for email: ${emailId}`);
            
            for (const attachment of attachments) {
                try {
                    if (!this.isValidAttachment(attachment)) {
                        continue;
                    }

                    const contentBuffer = this.getAttachmentBuffer(attachment);
                    if (!contentBuffer) {
                        continue;
                    }

                    const attachmentData = {
                        id: attachment.id || `attach_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        emailId: emailId,
                        filename: attachment.filename,
                        content: contentBuffer,
                        contentType: attachment.contentType || 'application/octet-stream',
                        size: attachment.size || contentBuffer.length
                    };

                    await this.models.Attachment.create(attachmentData, { transaction });
                    savedCount++;
                    logger.info(`Attachment saved: ${attachment.filename} (${contentBuffer.length} bytes) for email: ${emailId}`);

                } catch (attachmentError: any) {
                    logger.error(`Error saving attachment ${attachment.filename}:`, attachmentError);
                }
            }
            
            return savedCount;
        } catch (error) {
            logger.error(`Error saving attachments for email ${emailId}:`, error);
            throw error;
        }
    }

    private async saveNewAttachmentsForEmail(
        emailId: string, 
        attachments: IEmailAttachment[], 
        transaction?: any
    ): Promise<number> {
        let savedCount = 0;
        
        try {
            logger.info(`Checking for new attachments for email: ${emailId}`);
            
            const existingAttachments = await this.models.Attachment.findAll({
                where: { emailId },
                attributes: ['filename', 'size'],
                transaction
            });
            
            const existingAttachmentsMap = new Map();
            existingAttachments.forEach(att => {
                existingAttachmentsMap.set(att.filename, att.size);
            });
            
            for (const attachment of attachments) {
                try {
                    if (!this.isValidAttachment(attachment)) {
                        continue;
                    }

                    const contentBuffer = this.getAttachmentBuffer(attachment);
                    if (!contentBuffer) {
                        continue;
                    }

                    const existingSize = existingAttachmentsMap.get(attachment.filename);
                    const newSize = attachment.size || contentBuffer.length;

                    if (existingSize === undefined || existingSize !== newSize) {
                        const attachmentData = {
                            id: attachment.id || `attach_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            emailId: emailId,
                            filename: attachment.filename,
                            content: contentBuffer,
                            contentType: attachment.contentType || 'application/octet-stream',
                            size: newSize
                        };

                        if (existingSize !== undefined) {
                            await this.models.Attachment.update(attachmentData, {
                                where: { 
                                    emailId: emailId,
                                    filename: attachment.filename 
                                },
                                transaction
                            });
                            logger.info(`Attachment updated: ${attachment.filename} (${newSize} bytes)`);
                        } else {
                            await this.models.Attachment.create(attachmentData, { transaction });
                            logger.info(`New attachment saved: ${attachment.filename} (${newSize} bytes)`);
                        }
                        
                        savedCount++;
                    } else {
                        logger.debug(`Attachment already exists with same size: ${attachment.filename}`);
                    }

                } catch (attachmentError: any) {
                    logger.error(`Error saving attachment ${attachment.filename}:`, attachmentError);
                }
            }
            
            return savedCount;
        } catch (error) {
            logger.error(`Error saving new attachments for email ${emailId}:`, error);
            throw error;
        }
    }

    private isValidAttachment(attachment: IEmailAttachment): boolean {
        if (!attachment.content) {
            logger.warn(`Attachment ${attachment.filename} has no content, skipping`);
            return false;
        }
        
        if (!attachment.filename) {
            logger.warn(`Attachment has no filename, skipping`);
            return false;
        }
        
        return true;
    }

    private getAttachmentBuffer(attachment: IEmailAttachment): Buffer | null {
        try {
            if (Buffer.isBuffer(attachment.content)) {
                return attachment.content;
            } else if (typeof attachment.content === 'string') {
                return Buffer.from(attachment.content, 'base64');
            } else {
                logger.warn(`Unsupported attachment content type for ${attachment.filename}`);
                return null;
            }
        } catch (error) {
            logger.error(`Error converting attachment content to buffer: ${attachment.filename}`, error);
            return null;
        }
    }

    async updateEmailStatus(emailId: string, status: 'not_processed' | 'processing' | 'processed' | 'failed'): Promise<boolean> {
        try {
            const [affectedCount] = await this.models.Email.update(
                { status },
                { where: { id: emailId } }
            );

            return affectedCount > 0;
        } catch (error) {
            logger.error('Error in updateEmailStatus:', error);
            throw error;
        }
    }

    async updateEmailsStatusByGroup(emailGroupId: string, status: 'not_processed' | 'processing' | 'processed' | 'failed'): Promise<number> {
        try {
            const [affectedCount] = await this.models.Email.update(
                { status },
                { where: { emailGroupId } }
            );

            logger.info(`Updated ${affectedCount} emails in group ${emailGroupId} to status: ${status}`);
            return affectedCount;
        } catch (error) {
            logger.error(`Error updating email status for group ${emailGroupId}:`, error);
            throw error;
        }
    }

    async deleteEmailsByEmailGroupId(emailGroupId: string): Promise<number> {
        try {
            const result = await this.models.Email.destroy({
                where: { emailGroupId }
            });
            return result;
        } catch (error) {
            logger.error('Error in deleteEmailsByEmailGroupId:', error);
            throw error;
        }
    }

    async getNotProcessedEmails(): Promise<IEmail[]> {
        try {
            const emails = await this.models.Email.findAll({
                where: { status: 'not_processed' },
                include: [{
                    model: this.models.Attachment,
                    as: 'attachments'
                }],
                order: [['date', 'DESC']]
            });

            return emails.map(email => this.mapToIEmail(email));
        } catch (error) {
            logger.error('Error in getNotProcessedEmails:', error);
            throw error;
        }
    }

    async getEmailsByStatus(status: IEmail['status']): Promise<IEmail[]> {
        try {
            const emails = await this.models.Email.findAll({
                where: { status },
                include: [{
                    model: this.models.Attachment,
                    as: 'attachments'
                }],
                order: [['date', 'DESC']]
            });

            return emails.map(email => this.mapToIEmail(email));
        } catch (error) {
            logger.error('Error in getEmailsByStatus:', error);
            throw error;
        }
    }

    async getAllEmails(): Promise<IEmail[]> {
        try {
            const emails = await this.models.Email.findAll({
                include: [{
                    model: this.models.Attachment,
                    as: 'attachments'
                }],
                order: [['date', 'DESC']]
            });

            return emails.map(email => this.mapToIEmail(email));
        } catch (error) {
            logger.error('Error in getAllEmails:', error);
            throw error;
        }
    }

    async getEmailByMessageId(messageId: string): Promise<IEmail | null> {
        try {
            const email = await this.models.Email.findOne({
                where: { id: messageId },
                include: [{
                    model: this.models.Attachment,
                    as: 'attachments'
                }]
            });

            return email ? this.mapToIEmail(email) : null;
        } catch (error) {
            logger.error('Error in getEmailByMessageId:', error);
            throw error;
        }
    }

    async getTotalEmailsCount(): Promise<number> {
        try {
            return await this.models.Email.count();
        } catch (error) {
            logger.error('Error getting total emails count:', error);
            return 0;
        }
    }

    async getEmailsCountByStatus(status: IEmail['status']): Promise<number> {
        try {
            return await this.models.Email.count({
                where: { status }
            });
        } catch (error) {
            logger.error(`Error getting emails count by status ${status}:`, error);
            return 0;
        }
    }

    async getEmailsByEmailGroupId(emailGroupId: string): Promise<IEmail[]> {
        try {
            const emails = await this.models.Email.findAll({
                where: { emailGroupId },
                include: [{
                    model: this.models.Attachment,
                    as: 'attachments'
                }],
                order: [['date', 'DESC']]
            });

            return emails.map(email => this.mapToIEmail(email));
        } catch (error) {
            logger.error('Error in getEmailsByEmailGroupId:', error);
            throw error;
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

    private mapToIEmail(email: any): IEmail {
        const mappedEmail: IEmail = {
            id: email.id,
            from: email.from,
            to: email.to,
            subject: email.subject,
            date: email.date,
            emailGroupId: email.emailGroupId,
            status: email.status,
            text: email.text || ''
        };

        if (email.attachments) {
            mappedEmail.attachments = email.attachments.map((att: any) => ({
                id: att.id,
                emailId: att.emailId,
                filename: att.filename,
                content: att.content,
                contentType: att.contentType,
                size: att.size
            }));
        }

        return mappedEmail;
    }
}