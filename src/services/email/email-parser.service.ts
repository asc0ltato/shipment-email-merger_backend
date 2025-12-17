import { IParsedEmail } from '@/models/email';
import { IEmailAttachment } from '@/models/attachment';
import { logger } from '@/utils';
import { EmailGroupId } from '@/utils/email-group-id.ts';
import { EmailUtilsService } from '@/utils/email-utils.ts';

export class EmailParserService {
    private emailGroupIdService: EmailGroupId;
    private emailUtils: EmailUtilsService;

    constructor() {
        this.emailGroupIdService = new EmailGroupId();
        this.emailUtils = new EmailUtilsService();
    }

    async parseEmail(parsed: any): Promise<IParsedEmail | null> {
        try {
            const subjectText = parsed.subject || '';
            const primaryEmailGroupId = this.emailGroupIdService.extractEmailGroupIdFromText(subjectText) || 'unknown';

            const attachments: IEmailAttachment[] = [];

            if (parsed.attachments && Array.isArray(parsed.attachments)) {
                logger.info(`Found ${parsed.attachments.length} attachments in email`);

                for (const attachment of parsed.attachments) {
                    try {
                        let contentBuffer: Buffer | undefined;
                        
                        if (attachment.content) {
                            if (Buffer.isBuffer(attachment.content)) {
                                contentBuffer = attachment.content;
                            } else if (typeof attachment.content === 'string') {
                                contentBuffer = Buffer.from(attachment.content, 'base64');
                            } else if (attachment.content instanceof Uint8Array) {
                                contentBuffer = Buffer.from(attachment.content);
                            } else if (attachment.content?.data) {
                                contentBuffer = Buffer.from(attachment.content.data);
                            } else {
                                logger.warn(`Unsupported attachment content type for ${attachment.filename}`);
                                continue;
                            }
                        }

                        if (!contentBuffer) {
                            logger.warn(`No content for attachment: ${attachment.filename}`);
                            continue;
                        }

                        const attachmentData: IEmailAttachment = {
                            id: `attach_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            emailId: '',
                            filename: attachment.filename || `attachment_${Date.now()}.bin`,
                            content: contentBuffer,
                            contentType: attachment.contentType || this.detectContentType(attachment.filename),
                            size: contentBuffer.length
                        };

                        attachments.push(attachmentData);
                        logger.info(`Parsed attachment: ${attachmentData.filename}, size: ${attachmentData.size}, type: ${attachmentData.contentType}`);

                    } catch (attachmentError) {
                        logger.error(`Error processing attachment ${attachment.filename}:`, attachmentError);
                    }
                }
                logger.info(`Email parsing completed: ${parsed.subject || 'No subject'}, attachments: ${attachments.length}`)
            }

            const messageId = parsed.messageId || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            return {
                dbData: {
                    id: messageId,
                    from: this.emailUtils.getAddressText(parsed.from),
                    to: this.emailUtils.getAddressText(parsed.to),
                    subject: parsed.subject || 'No subject',
                    date: parsed.date || new Date(),
                    emailGroupId: primaryEmailGroupId,
                    status: 'not_processed',
                },
                uiData: {
                    text: parsed.text || '',
                    attachments: attachments
                }
            };
        } catch (error) {
            logger.error('Email parsing error:', error);
            return null;
        }
    }

    private detectContentType(filename: string): string {
        const extension = filename.split('.').pop()?.toLowerCase();
        
        const contentTypes: { [key: string]: string } = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'txt': 'text/plain',
            'csv': 'text/csv',
            'zip': 'application/zip',
            'rar': 'application/x-rar-compressed'
        };

        return contentTypes[extension || ''] || 'application/octet-stream';
    }

    isRelevantEmail(email: IParsedEmail): boolean {
        if (this.isSpamEmail(email)) {
            return false;
        }

        const subject = (email.dbData.subject || '').toLowerCase();
        const text = (email.uiData.text || '').toLowerCase();

        const keywords = [
            'заказ', 'доставк', 'отправлени', 'tracking', 'emailGroup',
            'доставка', 'отслеживан', 'накладная', 'трек', 'номер',
            'посылка', 'отправка', 'курьер', 'почта', 'delivery',
            'order', 'parcel', 'package'
        ];

        const hasKeyword = keywords.some(keyword =>
            subject.includes(keyword) || text.includes(keyword)
        );

        const hasEmailGroupId = email.dbData.emailGroupId && email.dbData.emailGroupId !== 'unknown';

        return hasKeyword || Boolean(hasEmailGroupId);
    }

    isSpamEmail(email: IParsedEmail): boolean {
        const subject = (email.dbData.subject || '').toLowerCase();
        const from = (email.dbData.from || '').toLowerCase();
        const text = (email.uiData.text || '').toLowerCase();

        const spamKeywords = [
            'безопасност', 'аккаунт', 'восстановл', 'вход', 'оповещение', 'security alert',
            'vacancy', 'ваканс', 'linkedin', 'job', 'работа',
            'promotion', 'promo', 'акция', 'распродаж',
            'newsletter', 'рассылка',
            'unsubscribe', 'отписаться',
            'advertisement', 'реклама',
            'news', 'новости', 'spam'
        ];

        const domain = this.emailUtils.extractEmailDomain(from);
        const hasSpamDomain = this.emailUtils.isSpamDomain(domain);

        const hasSpamKeyword = spamKeywords.some(keyword =>
            subject.includes(keyword) || text.includes(keyword)
        );

        return hasSpamKeyword || hasSpamDomain;
    }
}