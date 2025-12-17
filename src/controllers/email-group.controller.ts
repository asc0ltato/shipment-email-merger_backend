import { Request, Response, Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { AuthService } from '../services/auth/auth.service';
import { EmailGroupManagementService } from '../services/email-group/email-group-management.service';
import { AttachmentService } from '../services/email-group/attachment.service';
import { AiAnalysisService } from '../services/ai/ai-analysis.service';
import { EmailGroupRepository } from '@/repositories';
import { RequestLogger } from "@/utils/request-logger";
import { logger } from '@/utils';
import { SSEService } from '@/services/sse/sse.service';

export class EmailGroupController {
    constructor(
        private readonly authService: AuthService,
        private emailGroupManagementService: EmailGroupManagementService,
        private attachmentService: AttachmentService,
        private aiAnalysisService: AiAnalysisService,
        private requestLogger: RequestLogger,
        private emailGroupRepo: EmailGroupRepository
    ) {}

    public regenerateEmailGroupAI = async (req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('regenerateEmailGroupAI', req);

            const { emailGroupId } = req.params;

            const result = await this.aiAnalysisService.processSingleEmailGroup(emailGroupId);

            return res.json({
                success: true,
                message: 'AI analysis regenerated successfully',
                data: result.updatedEmailGroup
            });

        } catch (error) {
            logger.error('Failed to regenerate AI analysis:', error);

            try {
                const currentEmailGroup = await this.emailGroupRepo.getEmailGroupByEmailGroupId(req.params.emailGroupId);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to regenerate AI analysis',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    data: currentEmailGroup
                });
            } catch (fallbackError) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to regenerate AI analysis',
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    };

    public getApprovedEmailGroups = async (_req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('getApprovedEmailGroups', _req);
            const result = await this.emailGroupManagementService.getApprovedEmailGroups();

            return res.json({
                success: true,
                message: 'Approved email groups retrieved',
                data: result
            });

        } catch (error) {
            logger.error('Failed to get approved email groups:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get approved email groups',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    public getEmailGroups = async (_req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('getEmailGroups', _req);
            const result = await this.emailGroupManagementService.getAllEmailGroups();

            return res.json({
                success: true,
                message: `Found ${result.emailGroups.length} email groups`,
                data: result
            });
        } catch (error) {
            logger.error('Failed to get email groups:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get email groups',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    public generateAllSummaries = async (req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('generateAllSummaries', req);
    
            const result = await this.aiAnalysisService.generateSummariesForNeedingGroups();
    
            return res.json({
                success: true,
                message: `AI summaries generation completed. Processed: ${result.processed}, Total: ${result.total}`,
                data: result
            });
    
        } catch (error) {
            logger.error('Failed to generate AI summaries:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to generate AI summaries',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    public downloadAttachment = async (req: Request, res: Response): Promise<void> => {
        try {
            this.requestLogger.logRequest('downloadAttachment', req);

            const { emailGroupId, filename } = req.params;

            const { attachment } = await this.attachmentService.downloadAttachment(emailGroupId, filename);

            if (attachment.contentType) {
                res.setHeader('Content-Type', attachment.contentType);
            } else {
                res.setHeader('Content-Type', 'application/octet-stream');
            }

            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            res.setHeader('Cache-Control', 'no-cache');

            res.send(attachment.content || Buffer.alloc(0));

        } catch (error) {
            logger.error('Failed to download file:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to download file',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    public deleteEmailGroup = async (req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('deleteEmailGroup', req);

            const { emailGroupId } = req.params;
            const result = await this.emailGroupManagementService.deleteEmailGroup(emailGroupId);

            return res.json({
                success: true,
                message: `Email group ${emailGroupId} deleted successfully`,
                data: result
            });

        } catch (error) {
            logger.error('Failed to delete email group:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to delete email group',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    public deleteEmailGroupSummary = async (req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('deleteEmailGroupSummary', req);

            const { emailGroupId } = req.params;
            const result = await this.emailGroupManagementService.deleteEmailGroupSummary(emailGroupId);

            return res.json({
                success: true,
                message: 'AI analysis deleted successfully',
                data: result
            });

        } catch (error) {
            logger.error('Failed to delete AI analysis:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to delete AI analysis',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    public getAttachmentInfo = async (req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('getAttachmentInfo', req);

            const { emailGroupId } = req.params;
            const result = await this.attachmentService.getAttachmentInfo(emailGroupId);

            return res.json({
                success: true,
                message: `Found ${result.attachments.length} attachments`,
                data: result
            });

        } catch (error) {
            logger.error('Failed to get file information:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get file information',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    public approveEmailGroup = async (req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('approveEmailGroup', req);

            const { emailGroupId } = req.params;
            const result = await this.emailGroupManagementService.approveEmailGroup(emailGroupId);

            return res.json({
                success: true,
                message: `Email group ${emailGroupId} approved`,
                data: result
            });

        } catch (error) {
            logger.error('Failed to approve email group:', error);
            
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = errorMessage.includes('does not have AI analysis') ? 400 : 500;

            return res.status(statusCode).json({
                success: false,
                message: 'Failed to approve email group',
                error: errorMessage
            });
        }
    };

    public rejectEmailGroup = async (req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('rejectEmailGroup', req);

            const { emailGroupId } = req.params;
            const result = await this.emailGroupManagementService.rejectEmailGroup(emailGroupId);

            return res.json({
                success: true,
                message: `Email group ${emailGroupId} rejected`,
                data: result
            });

        } catch (error) {
            logger.error('Failed to reject email group:', error);
            
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = errorMessage.includes('does not have AI analysis') ? 400 : 500;

            return res.status(statusCode).json({
                success: false,
                message: 'Failed to reject email group',
                error: errorMessage
            });
        }
    };

    public subscribeApprovedSummaries = (req: Request, res: Response): void => {
        this.requestLogger.logRequest('subscribeApprovedSummaries', req);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const responseWithFlush = res as Response & { flushHeaders?: () => void };
        if (typeof responseWithFlush.flushHeaders === 'function') {
            responseWithFlush.flushHeaders();
        } else {
            res.write('\n');
        }

        const sseService = SSEService.getInstance();
        sseService.addClient(res);

        req.on('close', () => {
            sseService.removeClient(res);
        });
    };

    public getAuthMiddleware() {
        return requireAuth(this.authService);
    }

    public getRoutes(): Router {
        const router = Router();

        router.get('/', this.getAuthMiddleware(), this.getEmailGroups);
        router.get('/approved', this.getAuthMiddleware(), this.getApprovedEmailGroups);
        router.get('/approved/sse', this.getAuthMiddleware(), this.subscribeApprovedSummaries);
        router.delete('/:emailGroupId', this.getAuthMiddleware(), this.deleteEmailGroup);
        router.post('/generate-all-summaries', this.getAuthMiddleware(), this.generateAllSummaries);
        router.post('/:emailGroupId/regenerate-ai', this.getAuthMiddleware(), this.regenerateEmailGroupAI);
        router.delete('/:emailGroupId/summary', this.getAuthMiddleware(), this.deleteEmailGroupSummary);
        router.put('/:emailGroupId/approve', this.getAuthMiddleware(), this.approveEmailGroup);
        router.put('/:emailGroupId/reject', this.getAuthMiddleware(), this.rejectEmailGroup);
        router.get('/:emailGroupId/attachments', this.getAuthMiddleware(), this.getAttachmentInfo);
        router.get('/:emailGroupId/attachment/:filename', this.getAuthMiddleware(), this.downloadAttachment);

        return router;
    }
}