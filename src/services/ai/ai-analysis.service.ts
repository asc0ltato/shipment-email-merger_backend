import { GeminiService } from './gemini.service';
import { EmailGroupRepository } from '@/repositories';
import { SummaryService } from '../summary/summary.service';
import { logger } from '@/utils';
import { IEmailGroup } from "@/models/email-group";
import { ShipmentRequest } from "@/models/summary";
import { SSEService } from '../sse/sse.service';
import { EmailGroupId } from '@/utils/email-group-id';

export class AiAnalysisService {
    private emailGroupIdService: EmailGroupId;

    constructor(
        private geminiService: GeminiService,
        private emailGroupRepo: EmailGroupRepository,
        private summaryService: SummaryService
    ) {
        this.emailGroupIdService = new EmailGroupId();
    }

    async processSingleEmailGroup(emailGroupId: string): Promise<{
        emailGroupId: string;
        summaryId: string;
        analysis: any;
        summary: string;
        updatedEmailGroup: IEmailGroup;
    }> {
        let emailGroupData: IEmailGroup | null = null;

        try {
            logger.info(`Starting AI analysis for email group: ${emailGroupId}`);

            emailGroupData = await this.emailGroupRepo.getEmailGroupByEmailGroupId(emailGroupId);
            if (!emailGroupData) {
                throw new Error('Email group not found');
            }
            if (!emailGroupData.emails || emailGroupData.emails.length === 0) {
                throw new Error('No emails available for AI analysis');
            }

            let pendingSummary = await this.summaryService.getPendingSummaryByEmailGroupId(emailGroupId);
            let summaryId: string;

            if (pendingSummary) {
                summaryId = pendingSummary.summaryId;
                await this.summaryService.markSummaryAsProcessing(summaryId);
                logger.info(`Using existing pending summary: ${summaryId}`);
            } else {
                const allSummaries = await this.summaryService.getSummariesByEmailGroupId(emailGroupId);
                
                let maxVersion = 0;
                for (const summary of allSummaries) {
                    const versionMatch = summary.summaryId.match(/_v(\d+)$/);
                    if (versionMatch) {
                        const version = parseInt(versionMatch[1], 10);
                        if (version > maxVersion) {
                            maxVersion = version;
                        }
                    } else if (summary.summaryId === `summary_${emailGroupId}`) {
                        maxVersion = Math.max(maxVersion, 1);
                    }
                }
                
                const nextVersion = maxVersion + 1;
                summaryId = `summary_${emailGroupId}_v${nextVersion}`;
                await this.summaryService.createSummary(summaryId, emailGroupId, 'processing');
                
                if (maxVersion === 0) {
                    logger.info(`Created first summary: ${summaryId}`);
                } else {
                    logger.info(`Created new summary version ${nextVersion}: ${summaryId} (previous versions exist)`);
                }
            }

            await this.emailGroupRepo.updateEmailStatusForGroup(emailGroupId, 'processing');

            let structuredData: ShipmentRequest;
            let summaryText: string;

            try {
                structuredData = await this.geminiService.generateStructuredEmailGroupData(emailGroupData.emails);
                summaryText = this.geminiService.formatStructuredDataToText(structuredData);

                const hasUsefulData = this.geminiService.isMeaningfulAnalysis(structuredData);

                if (!hasUsefulData) {
                    logger.warn('AI analysis completed but no useful information found in emails');
                    logger.info('Email content sample:', {
                        subjects: emailGroupData.emails.map(e => e.subject),
                        has_order_numbers: emailGroupData.emails.some(e => {
                            const searchText = `${e.subject} ${e.text || ''}`;
                            return this.emailGroupIdService.hasEmailGroupId(searchText);
                        }),
                        email_count: emailGroupData.emails.length
                    });
                    
                    await this.summaryService.updateSummaryAnalysis(
                        summaryId, 
                        structuredData, 
                        summaryText, 
                        'failed'
                    );
                    await this.emailGroupRepo.updateEmailStatusForGroup(emailGroupId, 'failed');

                    logger.info(`Summary marked as failed: ${summaryId} - no useful information found`);

                    const updatedEmailGroup = await this.emailGroupRepo.getEmailGroupByEmailGroupId(emailGroupId);
                    if (!updatedEmailGroup) {
                        throw new Error('Failed to retrieve updated email group after AI analysis');
                    }

                    return {
                        emailGroupId,
                        summaryId,
                        analysis: structuredData,
                        summary: summaryText,
                        updatedEmailGroup
                    };
                }

                logger.info('AI analysis completed successfully with useful data');

                await this.summaryService.updateSummaryAnalysis(summaryId, structuredData, summaryText, 'pending');
                await this.emailGroupRepo.updateEmailStatusForGroup(emailGroupId, 'processed');

                logger.info(`Summary marked as pending for confirmation: ${summaryId}`);

                try {
                    const sseService = SSEService.getInstance();
                    const updatedGroupForSse = await this.emailGroupRepo.getEmailGroupByEmailGroupId(emailGroupId);
                    if (updatedGroupForSse && updatedGroupForSse.summary && updatedGroupForSse.summary.status === 'approved') {
                        sseService.sendApprovedSummary(updatedGroupForSse);
                    }
                } catch (e) {
                    logger.error('Failed to send SSE after AI analysis:', e);
                }

            } catch (aiError: any) {
                logger.error('AI analysis failed:', aiError);

                const statusCode = aiError.response?.status || 'unknown';
                const errorMessage = aiError.response?.data?.error?.message || aiError.message;
                
                logger.error(`AI analysis error (${statusCode}): ${errorMessage}. Summary and emails will be marked as failed.`);
                
                await this.emailGroupRepo.updateEmailStatusForGroup(emailGroupId, 'failed');
                await this.summaryService.markSummaryAsFailed(summaryId);

                throw new Error(`AI analysis failed: ${errorMessage}`);
            }

            const updatedEmailGroup = await this.emailGroupRepo.getEmailGroupByEmailGroupId(emailGroupId);
            if (!updatedEmailGroup) {
                throw new Error('Failed to retrieve updated email group after AI analysis');
            }

            return {
                emailGroupId,
                summaryId,
                analysis: structuredData!,
                summary: summaryText!,
                updatedEmailGroup
            };

        } catch (error: any) {
            logger.error(`AI analysis failed for email group ${emailGroupId}:`, error);

            try {
                await this.emailGroupRepo.updateEmailStatusForGroup(emailGroupId, 'failed');

                const activeSummary = await this.summaryService.getActiveSummaryByEmailGroupId(emailGroupId);
                if (activeSummary) {
                    await this.summaryService.markSummaryAsFailed(activeSummary.summaryId);
                }
            } catch (cleanupError) {
                logger.error('Error during cleanup after AI analysis failure:', cleanupError);
            }

            throw error;
        }
    }

    async processAllPendingSummaries(): Promise<{ processed: number; total: number }> {
        try {
            const allEmailGroups = await this.emailGroupRepo.getAllEmailGroups();
            let processedCount = 0;

            for (const emailGroup of allEmailGroups) {
                try {
                    if (emailGroup.emails && emailGroup.emails.length > 0) {
                        const hasPendingSummary = emailGroup.summary && 
                            (emailGroup.summary.status === 'pending' || emailGroup.summary.status === 'processing');
                        const shouldProcess = !hasPendingSummary || 
                            (emailGroup.summary &&
                                emailGroup.summary.status !== 'approved' &&
                                emailGroup.summary.status !== 'rejected');

                        if (shouldProcess) {
                            await this.processSingleEmailGroup(emailGroup.emailGroupId);
                            processedCount++;
                        }
                    }
                } catch (error) {
                    logger.warn(`AI analysis failed for email group ${emailGroup.emailGroupId}:`, error);
                }
            }

            return { processed: processedCount, total: allEmailGroups.length };
        } catch (error) {
            logger.error('Error processing all pending summaries:', error);
            throw error;
        }
    }

    async generateSummariesForNeedingGroups(): Promise<{ processed: number; total: number }> {
        try {
            const allEmailGroups = await this.emailGroupRepo.getAllEmailGroups();
            let processedCount = 0;
    
            for (const emailGroup of allEmailGroups) {
                try {
                    const hasNoSummary = !emailGroup.summary || !emailGroup.summary.summaryId;
                    
                    const hasNotProcessedEmails = emailGroup.emails?.some(
                        email => email.status === 'not_processed'
                    ) || false;
                    
                    const hasFailedSummary = emailGroup.summary?.status === 'failed';
    
                    if ((hasNoSummary || hasNotProcessedEmails || hasFailedSummary) && 
                        emailGroup.emails && emailGroup.emails.length > 0) {
                        
                        await this.processSingleEmailGroup(emailGroup.emailGroupId);
                        processedCount++;
                    }
                } catch (error) {
                    logger.warn(`AI analysis failed for email group ${emailGroup.emailGroupId}:`, error);
                }
            }
    
            return { processed: processedCount, total: allEmailGroups.length };
        } catch (error) {
            logger.error('Error processing email groups without summary:', error);
            throw error;
        }
    }
}