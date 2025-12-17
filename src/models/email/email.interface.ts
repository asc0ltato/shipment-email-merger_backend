import { IEmailAttachment } from '../attachment/attachment.interface';

export interface IEmail {
    id: string;
    from: string;
    to: string;
    subject: string;
    date: Date;
    emailGroupId: string;
    status: 'not_processed' | 'processing' | 'processed' | 'failed';
    text?: string;
    attachments?: IEmailAttachment[];
}

export interface IParsedEmail {
    dbData: IEmail;
    uiData: {
        text: string;
        attachments: IEmailAttachment[];
    };
}