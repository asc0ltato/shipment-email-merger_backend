import { SummaryRepository } from '@/repositories';
import { ISummary } from '@/models/summary';
import { logger } from '@/utils';

export class SummaryService {
    constructor(private summaryRepository: SummaryRepository) {}

    async createSummary(summaryId: string, emailGroupId: string, status: 'processing' | 'pending' = 'processing'): Promise<ISummary> {
        try {
            const summary = await this.summaryRepository.createSummary(summaryId, emailGroupId, status);
            logger.info(`Summary created: ${summaryId} for group ${emailGroupId} with status: ${status}`);
            return summary;
        } catch (error) {
            logger.error('Error in createSummary:', error);
            throw error;
        }
    }

    async getApprovedSummaryByEmailGroupId(emailGroupId: string): Promise<ISummary | null> {
        try {
            return await this.summaryRepository.getApprovedSummaryByEmailGroupId(emailGroupId);
        } catch (error) {
            logger.error('Error in getApprovedSummaryByEmailGroupId:', error);
            throw error;
        }
    }

    async getPendingSummaryByEmailGroupId(emailGroupId: string): Promise<ISummary | null> {
        try {
            return await this.summaryRepository.getPendingSummaryByEmailGroupId(emailGroupId);
        } catch (error) {
            logger.error('Error in getPendingSummaryByEmailGroupId:', error);
            throw error;
        }
    }

    async getRejectedSummaryByEmailGroupId(emailGroupId: string): Promise<ISummary | null> {
        try {
            return await this.summaryRepository.getRejectedSummaryByEmailGroupId(emailGroupId);
        } catch (error) {
            logger.error('Error in getRejectedSummaryByEmailGroupId:', error);
            throw error;
        }
    }

    async getActiveSummaryByEmailGroupId(emailGroupId: string): Promise<ISummary | null> {
        try {
            return await this.summaryRepository.getActiveSummaryByEmailGroupId(emailGroupId);
        } catch (error) {
            logger.error('Error in getActiveSummaryByEmailGroupId:', error);
            throw error;
        }
    }

    async deleteOldApprovedRejectedSummaries(emailGroupId: string, excludeSummaryId?: string): Promise<number> {
        try {
            const deletedCount = await this.summaryRepository.deleteOldApprovedRejectedSummaries(emailGroupId, excludeSummaryId);
            logger.info(`Deleted ${deletedCount} old approved/rejected summaries for group ${emailGroupId}`);
            return deletedCount;
        } catch (error) {
            logger.error('Error in deleteOldApprovedRejectedSummaries:', error);
            throw error;
        }
    }

    async getSummariesByEmailGroupId(emailGroupId: string): Promise<ISummary[]> {
        try {
            return await this.summaryRepository.getSummariesByEmailGroupId(emailGroupId);
        } catch (error) {
            logger.error('Error in getSummariesByEmailGroupId:', error);
            throw error;
        }
    }

    async markSummaryAsProcessing(summaryId: string): Promise<boolean> {
        try {
            const result = await this.summaryRepository.markSummaryAsProcessing(summaryId);
            logger.info(`Summary marked as processing: ${summaryId}`);
            return result;
        } catch (error) {
            logger.error('Error in markSummaryAsProcessing:', error);
            throw error;
        }
    }

    async markSummaryAsFailed(summaryId: string): Promise<boolean> {
        try {
            const result = await this.summaryRepository.markSummaryAsFailed(summaryId);
            logger.info(`Summary marked as failed: ${summaryId}`);
            return result;
        } catch (error) {
            logger.error('Error in markSummaryAsFailed:', error);
            throw error;
        }
    }

    async updateSummaryAnalysis(
        summaryId: string,
        shipmentData: any,
        summaryText: string,
        status: 'pending' | 'approved' | 'rejected' | 'failed' = 'pending'
    ): Promise<boolean> {
        try {
            const result = await this.summaryRepository.updateSummaryAnalysis(summaryId, shipmentData, summaryText, status);
            logger.info(`Summary analysis updated: ${summaryId} with status: ${status}`);
            return result;
        } catch (error) {
            logger.error('Error in updateSummaryAnalysis:', error);
            throw error;
        }
    }

    async updateSummaryStatus(summaryId: string, status: 'processing' | 'approved' | 'rejected' | 'failed'): Promise<boolean> {
        try {
            const result = await this.summaryRepository.updateSummaryStatus(summaryId, status);
            logger.info(`Summary status updated: ${summaryId} to ${status}`);
            return result;
        } catch (error) {
            logger.error('Error in updateSummaryStatus:', error);
            throw error;
        }
    }

    async approveSummary(summaryId: string): Promise<boolean> {
        try {
            const result = await this.summaryRepository.updateSummaryStatus(summaryId, 'approved');
            logger.info(`Summary approved: ${summaryId}`);
            return result;
        } catch (error) {
            logger.error('Error in approveSummary:', error);
            throw error;
        }
    }

    async rejectSummary(summaryId: string): Promise<boolean> {
        try {
            const result = await this.summaryRepository.updateSummaryStatus(summaryId, 'rejected');
            logger.info(`Summary rejected: ${summaryId}`);
            return result;
        } catch (error) {
            logger.error('Error in rejectSummary:', error);
            throw error;
        }
    }

    async getSummaryById(summaryId: string): Promise<ISummary | null> {
        try {
            return await this.summaryRepository.getSummaryById(summaryId);
        } catch (error) {
            logger.error('Error in getSummaryById:', error);
            throw error;
        }
    }

    async getSummariesByStatus(status: ISummary['status']): Promise<ISummary[]> {
        try {
            return await this.summaryRepository.getSummariesByStatus(status);
        } catch (error) {
            logger.error('Error in getSummariesByStatus:', error);
            throw error;
        }
    }

    async saveSummary(summary: ISummary): Promise<ISummary> {
        try {
            return await this.summaryRepository.saveSummary(summary);
        } catch (error) {
            logger.error('Error in saveSummary:', error);
            throw error;
        }
    }
}