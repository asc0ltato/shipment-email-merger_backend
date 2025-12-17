export interface IEmailAttachment {
    id: string;
    emailId: string;
    filename: string;
    content?: Buffer;
    contentType?: string;
    size?: number;
}