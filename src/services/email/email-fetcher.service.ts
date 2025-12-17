import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { logger } from '@/utils';
import { EmailUtilsService } from '@/utils/email-utils';
import { EmailGroupId } from '@/utils/email-group-id';

export interface FetchedEmail {
    id: string;
    from: string;
    to: string;
    subject: string;
    date: Date;
    text?: string;
    attachments: Array<{
        id: string;
        filename: string;
        content: Buffer;
        contentType: string;
        size: number;
    }>;
}

export class EmailFetcherService {
    private imap: Imap | null = null;
    private isConnected: boolean = false;
    private emailUtils: EmailUtilsService;
    private emailGroupIdService: EmailGroupId;

    constructor(
        private credentials: { email: string; accessToken: string },
        private oauthConfig: any
    ) {
        if (!oauthConfig) {
            throw new Error('OAuth configuration required for EmailFetcherService');
        }
        this.emailUtils = new EmailUtilsService();
        this.emailGroupIdService = new EmailGroupId();
    }

    async connect(): Promise<void> {
        if (this.isConnected) {
            logger.debug('IMAP connection already established');
            return;
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('IMAP connection timeout expired'));
            }, 15000);

            try {
                this.imap = this.createImapConnection();

                this.imap.once('ready', () => {
                    clearTimeout(timeout);
                    this.isConnected = true;
                    logger.info('IMAP connection successfully established');
                    resolve();
                });

                this.imap.once('error', (err: Error) => {
                    clearTimeout(timeout);
                    this.isConnected = false;
                    this.imap = null;

                    if (err.message.includes('AUTHENTICATIONFAILED') ||
                        err.message.includes('Invalid credentials') ||
                        err.message.includes('LOGIN failed')) {
                        reject(new Error('OAuth2 token invalid for IMAP access'));
                    } else if (err.message.includes('Connection timed out')) {
                        reject(new Error('Mail server connection timeout'));
                    } else if (err.message.includes('Already connected')) {
                        this.isConnected = true;
                        resolve();
                    } else {
                        reject(err);
                    }
                });

                this.imap.connect();
            } catch (error) {
                clearTimeout(timeout);
                reject(error);
            }
        });
    }

    isActive(): boolean {
        return this.isConnected && this.imap !== null;
    }

    async fetchEmailsFilteredByEmailGroupId(options: {
        startDate?: string;
        endDate?: string;
        days?: number;
    } = {}): Promise<FetchedEmail[]> {
        logger.info('Fetching emails filtered by email group ID with options:', options);

        if (!this.isConnected || !this.imap) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            if (!this.imap) {
                reject(new Error('IMAP connection unavailable'));
                return;
            }

            this.imap.openBox('INBOX', false, (error: Error | null) => {
                if (error) {
                    reject(error);
                    return;
                }

                const searchCriteria = this.createSearchCriteria(options);
                logger.info(`Searching FILTERED emails with criteria: ${JSON.stringify(searchCriteria)}`);

                this.imap!.search(searchCriteria, async (searchError: Error | null, results: number[]) => {
                    if (searchError) {
                        logger.error('Search error:', searchError);
                        reject(searchError);
                        return;
                    }

                    logger.info(`Found ${results.length} filtered emails in specified period`);

                    if (results.length === 0) {
                        resolve([]);
                        return;
                    }

                    try {
                        const emails = await this.fetchEmailsWithAttachments(results.reverse());
                        const finalEmails = emails.filter(email =>
                            this.emailGroupIdService.hasEmailGroupId(email.subject)
                        );

                        logger.info(`Final filtered ${finalEmails.length} emails with email group IDs`);
                        resolve(finalEmails);
                    } catch (fetchError) {
                        reject(fetchError);
                    }
                });
            });
        });
    }

    async fetchEmailsByEmailGroupId(emailGroupId: string): Promise<FetchedEmail[]> {
        logger.info(`Searching ALL emails for email group: ${emailGroupId} (no date restrictions)`);

        if (!this.isConnected || !this.imap) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            if (!this.imap) {
                reject(new Error('IMAP connection unavailable'));
                return;
            }

            this.imap.openBox('INBOX', false, (error: Error | null) => {
                if (error) {
                    reject(error);
                    return;
                }

                const searchCriteria = [
                    ['OR',
                        ['TEXT', emailGroupId],
                        ['SUBJECT', emailGroupId]
                    ]
                ];

                logger.info(`IMAP search for email group ${emailGroupId} (all dates)`);

                this.imap!.search(searchCriteria, (searchError: Error | null, results: number[]) => {
                    if (searchError) {
                        logger.error('Search error:', searchError);
                        reject(searchError);
                        return;
                    }

                    logger.info(`Found ${results.length} emails containing "${emailGroupId}" from all dates`);

                    if (results.length === 0) {
                        resolve([]);
                        return;
                    }

                    const emailsToFetch = results.reverse();
                    this.fetchEmailsWithAttachments(emailsToFetch).then(resolve).catch(reject);
                });
            });
        });
    }

    private createSearchCriteria(options: {
        startDate?: string;
        endDate?: string;
        days?: number;
    }): any[] {
        const searchCriteria: any[] = [];

        if (options.startDate) {
            const imapStartDate = this.emailUtils.convertToIMAPDate(options.startDate);
            searchCriteria.push(['SINCE', imapStartDate]);
        }
        if (options.endDate) {
            const imapEndDate = this.emailUtils.convertToIMAPDate(options.endDate);
            const beforeDate = new Date(imapEndDate);
            beforeDate.setDate(beforeDate.getDate() + 1);
            const imapBeforeDate = beforeDate.toISOString().split('T')[0];
            searchCriteria.push(['BEFORE', imapBeforeDate]);
        }
        else if (options.days) {
            const since = new Date();
            since.setDate(since.getDate() - options.days);
            const imapStartDate = since.toISOString().split('T')[0];
            searchCriteria.push(['SINCE', imapStartDate]);
        }
        else if (!options.startDate && !options.endDate) {
            const since = new Date();
            since.setDate(since.getDate() - 1);
            const imapStartDate = since.toISOString().split('T')[0];
            searchCriteria.push(['SINCE', imapStartDate]);
            logger.info('No date specified, using default: last 1 day');
        }

        searchCriteria.push(['SUBJECT', 'Shipment']);
        return searchCriteria;
    }

    private async fetchEmailsWithAttachments(messageNumbers: number[]): Promise<FetchedEmail[]> {
        return new Promise((resolve, reject) => {
            if (!this.imap) {
                reject(new Error('IMAP connection unavailable'));
                return;
            }

            const emails: FetchedEmail[] = [];
            let processed = 0;

            if (messageNumbers.length === 0) {
                resolve([]);
                return;
            }

            logger.info(`Starting to fetch ${messageNumbers.length} emails with attachments`);

            const fetch = this.imap.fetch(messageNumbers, {
                bodies: '',
                struct: true,
                markSeen: false
            });

            fetch.on('message', async (msg: Imap.ImapMessage) => {
                try {
                    const email = await this.processSingleMessage(msg);
                    if (email) {
                        emails.push(email);
                    }
                } catch (error) {
                    logger.error('Error processing message:', error);
                } finally {
                    processed++;
                    logger.info(`Processed ${processed}/${messageNumbers.length} emails`);

                    if (processed === messageNumbers.length) {
                        logger.info(`Successfully fetched ${emails.length} emails with attachments`);
                        resolve(emails);
                    }
                }
            });

            fetch.once('error', (fetchErr) => {
                logger.error('Email fetching error:', fetchErr);
                reject(fetchErr);
            });

            fetch.once('end', () => {
                logger.info('IMAP fetch operation ended');
            });
        });
    }

    private async processSingleMessage(msg: Imap.ImapMessage): Promise<FetchedEmail | null> {
        return new Promise((resolve) => {
            let buffer = Buffer.alloc(0);

            msg.on('body', (stream: NodeJS.ReadableStream) => {
                stream.on('data', (chunk: Buffer) => {
                    buffer = Buffer.concat([buffer, chunk]);
                });
            });

            msg.once('end', async () => {
                try {
                    const parsed = await simpleParser(buffer);
                    const attachments = await this.processAttachments(parsed.attachments);

                    const email: FetchedEmail = {
                        id: parsed.messageId || `msg-${Date.now()}-${Math.random()}`,
                        from: this.emailUtils.getAddressText(parsed.from),
                        to: this.emailUtils.getAddressText(parsed.to),
                        subject: parsed.subject || 'No subject',
                        date: parsed.date || new Date(),
                        text: parsed.text || '',
                        attachments: attachments
                    };

                    logger.info(`[EMAIL FETCHED] Subject: "${email.subject}" with ${attachments.length} attachments`);
                    resolve(email);
                } catch (parseError) {
                    logger.error('Email parsing error:', parseError);
                    resolve(null);
                }
            });
        });
    }

    private async processAttachments(rawAttachments: any[]): Promise<FetchedEmail['attachments']> {
        const attachments: FetchedEmail['attachments'] = [];

        if (rawAttachments && Array.isArray(rawAttachments)) {
            for (const attachment of rawAttachments) {
                try {
                    if (attachment.content) {
                        let contentBuffer: Buffer;
    
                        if (Buffer.isBuffer(attachment.content)) {
                            contentBuffer = attachment.content;
                        } else if (typeof attachment.content === 'string') {
                            contentBuffer = Buffer.from(attachment.content, 'base64');
                        } else if (attachment.content instanceof Uint8Array) {
                            contentBuffer = Buffer.from(attachment.content);
                        } else {
                            contentBuffer = Buffer.from(attachment.content.data || attachment.content);
                        }

                        attachments.push({
                            id: `attach_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            filename: attachment.filename || `attachment_${Date.now()}.bin`,
                            content: contentBuffer,
                            contentType: attachment.contentType || 'application/octet-stream',
                            size: contentBuffer.length,
                        });

                        logger.info(`Fetched attachment: ${attachment.filename}, size: ${contentBuffer.length}, type: ${attachment.contentType}`);
                    }
                } catch (attachmentError) {
                    logger.error(`Error processing attachment ${attachment.filename}:`, attachmentError);
                }
            }
        }

        return attachments;
    }

    public getEmail(): string {
        return this.credentials.email;
    }

    async disconnect(): Promise<void> {
        return new Promise((resolve) => {
            if (this.imap) {
                const timeout = setTimeout(() => {
                    logger.warn('IMAP disconnect timeout, forcing close');
                    this.isConnected = false;
                    this.imap = null;
                    resolve();
                }, 5000);

                this.imap.once('end', () => {
                    clearTimeout(timeout);
                    this.isConnected = false;
                    this.imap = null;
                    logger.info('IMAP connection closed');
                    resolve();
                });

                try {
                    this.imap.end();
                } catch (error) {
                    clearTimeout(timeout);
                    logger.warn('Error during IMAP end:', error);
                    this.isConnected = false;
                    this.imap = null;
                    resolve();
                }
            } else {
                resolve();
            }
        });
    }

    async safeDisconnect(): Promise<void> {
        if (!this.isConnected || !this.imap) {
            return;
        }

        try {
            await this.disconnect();
        } catch (error) {
            logger.warn('Safe disconnect warning:', error);
            this.isConnected = false;
            this.imap = null;
        }
    }

    private createImapConnection(): Imap {
        if (!this.oauthConfig?.imapHost || !this.oauthConfig?.imapPort) {
            throw new Error(`Invalid OAuth configuration: missing imapHost or imapPort`);
        }

        const imapConfig: Imap.Config = {
            user: this.credentials.email,
            host: this.oauthConfig.imapHost,
            port: this.oauthConfig.imapPort,
            tls: true,
            tlsOptions: {
                rejectUnauthorized: false,
                servername: this.oauthConfig.imapHost,
            },
            authTimeout: 15000,
            connTimeout: 15000,
            keepalive: {
                interval: 10000,
                idleInterval: 30000,
                forceNoop: true
            },
            xoauth2: this.emailUtils.generateXOAuth2Token(this.credentials.email, this.credentials.accessToken)
        } as any;

        logger.debug('IMAP config:', {
            host: imapConfig.host,
            port: imapConfig.port,
            user: imapConfig.user
        });

        return new Imap(imapConfig);
    }
}