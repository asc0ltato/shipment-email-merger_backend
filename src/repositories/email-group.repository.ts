import { Sequelize, Op } from 'sequelize';
import { initModels, Models } from '@/models';
import { IEmailGroup } from '@/models/email-group';
import { logger } from '@/utils';

export class EmailGroupRepository {
    private models: Models;
    private sequelize: Sequelize;

    constructor(sequelize: Sequelize) {
        this.sequelize = sequelize;
        this.models = initModels(sequelize);
    }

    async getAllEmailGroups(): Promise<IEmailGroup[]> {
        try {
            const emailGroups = await this.models.EmailGroup.findAll({
                include: [
                    {
                        model: this.models.Email,
                        as: 'emails',
                        include: [{
                            model: this.models.Attachment,
                            as: 'attachments'
                        }]
                    },
                    {
                        model: this.models.Summary,
                        as: 'summaries',
                        required: false,
                        order: [['updatedAt', 'DESC']]
                    },
                    {
                        model: this.models.User,
                        as: 'user',
                        attributes: ['id', 'email']
                    }
                ],
                order: [['updatedAt', 'DESC']]
            });

            return emailGroups.map(emailGroup => this.mapToIEmailGroup(emailGroup));
        } catch (error) {
            logger.error('Error in getAllEmailGroups:', error);
            throw error;
        }
    }

    async getEmailGroupByEmailGroupId(emailGroupId: string): Promise<IEmailGroup | null> {
        try {
            const emailGroup = await this.models.EmailGroup.findOne({
                where: { emailGroupId },
                include: [
                    {
                        model: this.models.Email,
                        as: 'emails',
                        include: [{
                            model: this.models.Attachment,
                            as: 'attachments'
                        }]
                    },
                    {
                        model: this.models.Summary,
                        as: 'summaries',
                        required: false,
                        order: [['updatedAt', 'DESC']]
                    }
                ]
            });

            if (!emailGroup) {
                return null;
            }

            return this.mapToIEmailGroup(emailGroup);
        } catch (error) {
            logger.error('Error in getEmailGroupByEmailGroupId:', error);
            throw error;
        }
    }

    async getEmailGroupBySummaryId(summaryId: string): Promise<IEmailGroup | null> {
        try {
            const summary = await this.models.Summary.findOne({
                where: { summaryId },
                include: [{
                    model: this.models.EmailGroup,
                    as: 'emailGroupRef',
                    include: [
                        {
                            model: this.models.Email,
                            as: 'emails'
                        }
                    ]
                }]
            });

            if (!summary || !(summary as any).emailGroupRef) {
                return null;
            }

            const emailGroup = (summary as any).emailGroupRef;
            const mappedGroup = this.mapToIEmailGroup(emailGroup);
            mappedGroup.summary = this.mapToISummary(summary);
            return mappedGroup;
        } catch (error) {
            logger.error('Error in getEmailGroupBySummaryId:', error);
            throw error;
        }
    }

   async saveEmailGroup(emailGroupData: {
        emailGroupId: string;
        userId?: number;
        createdAt?: Date;
        updatedAt?: Date;
    }): Promise<IEmailGroup> {
        try {
            const emailGroupToSave = {
                emailGroupId: emailGroupData.emailGroupId,
                userId: emailGroupData.userId,
                createdAt: emailGroupData.createdAt || new Date(),
                updatedAt: emailGroupData.updatedAt || new Date()
            };

            const [savedEmailGroup] = await this.models.EmailGroup.upsert(emailGroupToSave, {
                conflictFields: ['emailGroupId'],
                returning: true
            });

            logger.info(`Email group saved: ${emailGroupData.emailGroupId}`);
            return this.mapToIEmailGroup(savedEmailGroup);
        } catch (error) {
            logger.error('Error in saveEmailGroup:', error);
            throw error;
        }
    }

    async updateEmailStatusForGroup(emailGroupId: string, status: 'not_processed' | 'processing' | 'processed' | 'failed'): Promise<number> {
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


    async getApprovedEmailGroups(): Promise<IEmailGroup[]> {
        try {
            const approvedSummaries = await this.models.Summary.findAll({
                where: { status: 'approved' },
                include: [{
                    model: this.models.EmailGroup,
                    as: 'emailGroupRef',
                    include: [
                        {
                            model: this.models.Email,
                            as: 'emails',
                            include: [{
                                model: this.models.Attachment,
                                as: 'attachments'
                            }]
                        },
                        {
                            model: this.models.User,
                            as: 'user',
                            attributes: ['id', 'email']
                        }
                    ]
                }],
                order: [['updatedAt', 'DESC']]
            });

            const emailGroups: IEmailGroup[] = [];
            const processedGroupIds = new Set<string>();

            for (const summary of approvedSummaries) {
                const emailGroup = (summary as any).emailGroupRef;
                if (emailGroup && !processedGroupIds.has(emailGroup.emailGroupId)) {
                    processedGroupIds.add(emailGroup.emailGroupId);
                    const mappedGroup = this.mapToIEmailGroup(emailGroup);
                    mappedGroup.summary = this.mapToISummary(summary);
                    emailGroups.push(mappedGroup);
                }
            }

            return emailGroups;
        } catch (error) {
            logger.error('Error in getApprovedEmailGroups:', error);
            throw error;
        }
    }

    private mapToISummary(summary: any): any {
        return {
            summaryId: summary.summaryId,
            emailGroupId: summary.emailGroupId,
            shipment_data: summary.shipment_data,
            summary: summary.summary || '',
            status: summary.status,
            createdAt: summary.createdAt,
            updatedAt: summary.updatedAt
        };
    }

   async deleteEmailGroup(emailGroupId: string): Promise<boolean> {
        try {
            const result = await this.models.EmailGroup.destroy({
                where: { emailGroupId }
            });
            return result > 0;
        } catch (error) {
            logger.error('Error in deleteEmailGroup:', error);
            throw error;
        }
    }

    async createEmailGroup(emailGroupId: string, userId?: number): Promise<IEmailGroup> {
        try {
            const emailGroupData = {
                emailGroupId,
                summaryId: null,
                userId,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const emailGroup = await this.models.EmailGroup.create(emailGroupData);
            return this.mapToIEmailGroup(emailGroup);
        } catch (error) {
            logger.error('Error in createEmailGroup:', error);
            throw error;
        }
    }

    async getEmailGroupsWithoutSummary(): Promise<IEmailGroup[]> {
        try {
            const allGroups = await this.models.EmailGroup.findAll({
                include: [
                    {
                        model: this.models.Email,
                        as: 'emails',
                        include: [{
                            model: this.models.Attachment,
                            as: 'attachments'
                        }]
                    },
                    {
                        model: this.models.Summary,
                        as: 'summaries',
                        where: {
                            status: { [Op.in]: ['pending', 'processing'] }
                        },
                        required: false
                    },
                    {
                        model: this.models.User,
                        as: 'user',
                        attributes: ['id', 'email']
                    }
                ],
                order: [['createdAt', 'DESC']]
            });

            const groupsWithoutSummary = allGroups.filter((group: any) => 
                !group.summaries || group.summaries.length === 0
            );

            return groupsWithoutSummary.map((emailGroup: any) => this.mapToIEmailGroup(emailGroup));
        } catch (error) {
            logger.error('Error in getEmailGroupsWithoutSummary:', error);
            throw error;
        }
    }

    async getEmailGroupsWithSummary(): Promise<IEmailGroup[]> {
        try {
            const summaries = await this.models.Summary.findAll({
                where: {
                    status: { [Op.in]: ['pending', 'processing'] }
                },
                include: [{
                    model: this.models.EmailGroup,
                    as: 'emailGroupRef',
                    include: [
                        {
                            model: this.models.Email,
                            as: 'emails',
                            include: [{
                                model: this.models.Attachment,
                                as: 'attachments'
                            }]
                        },
                        {
                            model: this.models.User,
                            as: 'user',
                            attributes: ['id', 'email']
                        }
                    ]
                }],
                order: [['updatedAt', 'DESC']]
            });

            const emailGroupsMap = new Map<string, IEmailGroup>();
            for (const summary of summaries) {
                const emailGroup = (summary as any).emailGroupRef;
                if (emailGroup && !emailGroupsMap.has(emailGroup.emailGroupId)) {
                    const mappedGroup = this.mapToIEmailGroup(emailGroup);
                    mappedGroup.summary = this.mapToISummary(summary);
                    emailGroupsMap.set(emailGroup.emailGroupId, mappedGroup);
                }
            }

            return Array.from(emailGroupsMap.values());
        } catch (error) {
            logger.error('Error in getEmailGroupsWithSummary:', error);
            throw error;
        }
    }

    private mapToIEmailGroup(emailGroup: any): IEmailGroup {
        const mappedEmailGroup: IEmailGroup = {
            emailGroupId: emailGroup.emailGroupId,
            userId: emailGroup.userId,
            createdAt: emailGroup.createdAt,
            updatedAt: emailGroup.updatedAt
        };

        if (emailGroup.summaries && emailGroup.summaries.length > 0) {
            mappedEmailGroup.summaries = emailGroup.summaries.map((s: any) => this.mapToISummary(s));
            
            const pendingSummary = emailGroup.summaries.find((s: any) => 
                s.status === 'pending' || s.status === 'processing'
            );
            if (pendingSummary) {
                mappedEmailGroup.summary = this.mapToISummary(pendingSummary);
            } else {
                const approvedRejectedSummary = emailGroup.summaries.find((s: any) => 
                    s.status === 'approved' || s.status === 'rejected'
                );
                if (approvedRejectedSummary) {
                    mappedEmailGroup.summary = this.mapToISummary(approvedRejectedSummary);
                } else {
                    mappedEmailGroup.summary = this.mapToISummary(emailGroup.summaries[0]);
                }
            }
        } else if (emailGroup.summary) {
            mappedEmailGroup.summary = this.mapToISummary(emailGroup.summary);
        }

        if (emailGroup.emails) {
            mappedEmailGroup.emails = emailGroup.emails.map((email: any) => ({
                id: email.id,
                from: email.from,
                to: email.to,
                subject: email.subject,
                date: email.date,
                emailGroupId: email.emailGroupId,
                status: email.status,
                text: email.text || '',
                html: email.html || '',
                attachments: email.attachments ? email.attachments.map((att: any) => ({
                    id: att.id,
                    emailId: att.emailId,
                    filename: att.filename,
                    content: att.content,
                    contentType: att.contentType,
                    size: att.size
                })) : []
            }));
        }

        if (emailGroup.user) {
            (mappedEmailGroup as any).user = emailGroup.user;
        }

        return mappedEmailGroup;
    }
}