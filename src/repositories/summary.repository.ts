import { Sequelize, Op } from 'sequelize';
import { initModels, Models } from '@/models';
import { ISummary } from '@/models/summary';
import { logger } from '@/utils';

export class SummaryRepository {
    private models: Models;

    constructor(sequelize: Sequelize) {
        this.models = initModels(sequelize);
    }

    async getSummaryById(summaryId: string): Promise<ISummary | null> {
        try {
            const summary = await this.models.Summary.findOne({
                where: { summaryId },
                include: [{
                    model: this.models.EmailGroup,
                    as: 'emailGroupRef',
                    include: [{
                        model: this.models.Email,
                        as: 'emails'
                    }]
                }]
            });

            return summary ? this.mapToISummary(summary) : null;
        } catch (error) {
            logger.error('Error in getSummaryById:', error);
            throw error;
        }
    }

    async saveSummary(summary: ISummary): Promise<ISummary> {
        try {
            const summaryData = {
                summaryId: summary.summaryId,
                emailGroupId: summary.emailGroupId,
                shipment_data: summary.shipment_data,
                summary: summary.summary,
                status: summary.status,
                createdAt: summary.createdAt,
                updatedAt: summary.updatedAt
            };

            const [savedSummary] = await this.models.Summary.upsert(summaryData, {
                conflictFields: ['summaryId'],
                returning: true
            });

            logger.info(`Summary saved: ${summary.summaryId}`);
            return this.mapToISummary(savedSummary);
        } catch (error) {
            logger.error('Error in saveSummary:', error);
            throw error;
        }
    }

    async updateSummaryStatus(summaryId: string, status: 'processing' | 'approved' | 'rejected' | 'failed'): Promise<boolean> {
        try {
            const [affectedCount] = await this.models.Summary.update(
                { status, updatedAt: new Date() },
                { where: { summaryId } }
            );

            return affectedCount > 0;
        } catch (error) {
            logger.error('Error in updateSummaryStatus:', error);
            throw error;
        }
    }

    async updateSummaryAnalysis(summaryId: string, shipmentData: any, summaryText: string, status: 'pending' | 'approved' | 'rejected' | 'failed' = 'pending'): Promise<boolean> {
        try {
            const [affectedCount] = await this.models.Summary.update(
                {
                    shipment_data: shipmentData,
                    summary: summaryText,
                    status: status,
                    updatedAt: new Date()
                },
                { where: { summaryId } }
            );

            return affectedCount > 0;
        } catch (error) {
            logger.error('Error in updateSummaryAnalysis:', error);
            throw error;
        }
    }

    async deleteSummary(summaryId: string): Promise<boolean> {
        try {
            const result = await this.models.Summary.destroy({
                where: { summaryId }
            });
            return result > 0;
        } catch (error) {
            logger.error('Error in deleteSummary:', error);
            throw error;
        }
    }

    async getSummariesByStatus(status: ISummary['status']): Promise<ISummary[]> {
        try {
            const summaries = await this.models.Summary.findAll({
                where: { status },
                include: [{
                    model: this.models.EmailGroup,
                    as: 'emailGroupRef'
                }],
                order: [['updatedAt', 'DESC']]
            });

            return summaries.map(summary => this.mapToISummary(summary));
        } catch (error) {
            logger.error('Error in getSummariesByStatus:', error);
            throw error;
        }
    }

    async createSummary(summaryId: string, emailGroupId: string, status: 'processing' | 'pending' = 'processing'): Promise<ISummary> {
        try {
            const summaryData = {
                summaryId,
                emailGroupId,
                shipment_data: this.createDefaultShipmentData(),
                summary: '',
                status: status,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const summary = await this.models.Summary.create(summaryData);
            return this.mapToISummary(summary);
        } catch (error) {
            logger.error('Error in createSummary:', error);
            throw error;
        }
    }

    async getApprovedSummaryByEmailGroupId(emailGroupId: string): Promise<ISummary | null> {
        try {
            const summary = await this.models.Summary.findOne({
                where: {
                    emailGroupId,
                    status: 'approved'
                },
                order: [['updatedAt', 'DESC']]
            });

            return summary ? this.mapToISummary(summary) : null;
        } catch (error) {
            logger.error('Error in getApprovedSummaryByEmailGroupId:', error);
            throw error;
        }
    }

    async getPendingSummaryByEmailGroupId(emailGroupId: string): Promise<ISummary | null> {
        try {
            const summary = await this.models.Summary.findOne({
                where: {
                    emailGroupId,
                    status: 'pending'
                },
                order: [['updatedAt', 'DESC']]
            });

            return summary ? this.mapToISummary(summary) : null;
        } catch (error) {
            logger.error('Error in getPendingSummaryByEmailGroupId:', error);
            throw error;
        }
    }

    async getRejectedSummaryByEmailGroupId(emailGroupId: string): Promise<ISummary | null> {
        try {
            const summary = await this.models.Summary.findOne({
                where: {
                    emailGroupId,
                    status: 'rejected'
                },
                order: [['updatedAt', 'DESC']]
            });

            return summary ? this.mapToISummary(summary) : null;
        } catch (error) {
            logger.error('Error in getRejectedSummaryByEmailGroupId:', error);
            throw error;
        }
    }

    async getActiveSummaryByEmailGroupId(emailGroupId: string): Promise<ISummary | null> {
        try {
            let summary = await this.models.Summary.findOne({
                where: {
                    emailGroupId,
                    status: 'pending'
                },
                order: [['updatedAt', 'DESC']]
            });

            if (summary) {
                return this.mapToISummary(summary);
            }

            summary = await this.models.Summary.findOne({
                where: {
                    emailGroupId,
                    status: 'approved'
                },
                order: [['updatedAt', 'DESC']]
            });

            if (summary) {
                return this.mapToISummary(summary);
            }

            summary = await this.models.Summary.findOne({
                where: {
                    emailGroupId,
                    status: 'rejected'
                },
                order: [['updatedAt', 'DESC']]
            });

            return summary ? this.mapToISummary(summary) : null;
        } catch (error) {
            logger.error('Error in getActiveSummaryByEmailGroupId:', error);
            throw error;
        }
    }

    async getSummariesByEmailGroupId(emailGroupId: string): Promise<ISummary[]> {
        try {
            const summaries = await this.models.Summary.findAll({
                where: { emailGroupId },
                order: [['createdAt', 'DESC']]
            });

            return summaries.map(summary => this.mapToISummary(summary));
        } catch (error) {
            logger.error('Error in getSummariesByEmailGroupId:', error);
            throw error;
        }
    }

    async deleteOldApprovedRejectedSummaries(emailGroupId: string, excludeSummaryId?: string): Promise<number> {
        try {
            const whereClause: any = {
                emailGroupId,
                status: { [Op.in]: ['approved', 'rejected'] }
            };

            if (excludeSummaryId) {
                whereClause.summaryId = { [Op.ne]: excludeSummaryId };
            }

            const deletedCount = await this.models.Summary.destroy({
                where: whereClause
            });

            logger.info(`Deleted ${deletedCount} old approved/rejected summaries for group ${emailGroupId}`);
            return deletedCount;
        } catch (error) {
            logger.error('Error in deleteOldApprovedRejectedSummaries:', error);
            throw error;
        }
    }

    async getApprovedSummaries(): Promise<ISummary[]> {
        try {
            const summaries = await this.models.Summary.findAll({
                where: { status: 'approved' },
                include: [{
                    model: this.models.EmailGroup,
                    as: 'emailGroupRef',
                    include: [{
                        model: this.models.Email,
                        as: 'emails',
                        include: [{
                            model: this.models.Attachment,
                            as: 'attachments'
                        }]
                    }, {
                        model: this.models.User,
                        as: 'user',
                        attributes: ['id', 'email']
                    }]
                }],
                order: [['updatedAt', 'DESC']]
            });

            return summaries.map(summary => this.mapToISummary(summary));
        } catch (error) {
            logger.error('Error in getApprovedSummaries:', error);
            throw error;
        }
    }

    async markSummaryAsProcessing(summaryId: string): Promise<boolean> {
        return this.updateSummaryStatus(summaryId, 'processing');
    }

    async markSummaryAsFailed(summaryId: string): Promise<boolean> {
        return this.updateSummaryStatus(summaryId, 'failed');
    }

    private createDefaultShipmentData(): any {
        return {
            name: 'Default Shipment Data',
            shipment_details: [],
            modes: []
        };
    }

    private mapToISummary(summary: any): ISummary {
        const mappedSummary: ISummary = {
            summaryId: summary.summaryId,
            emailGroupId: summary.emailGroupId,
            shipment_data: summary.shipment_data,
            summary: summary.summary || '',
            status: summary.status,
            createdAt: summary.createdAt,
            updatedAt: summary.updatedAt
        };

        if (summary.emailGroupRef) {
            (mappedSummary as any).emailGroup = summary.emailGroupRef;
        } else if (summary.emailGroup) {
            (mappedSummary as any).emailGroup = summary.emailGroup;
        }

        return mappedSummary;
    }
}