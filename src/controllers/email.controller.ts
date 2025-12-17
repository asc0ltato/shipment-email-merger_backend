import { Request, Response, Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { AuthService } from '../services/auth/auth.service';
import { EmailAnalysisService } from '../services/email/email-analysis.service';
import { EmailViewService } from "@/services/email/email-view.service";
import { RequestLogger } from "@/utils/request-logger";
import { UserRepository } from "@/repositories";
import { logger } from "@/utils";
import { EmailTargetedService } from '@/services/email/email-targeted.service';
import { EmailFullSyncService } from '@/services/email/email-full-sync.service';
import { EmailBaseService } from '@/services/email/email-base.service';
import { ResponseUtils } from '@/utils/response-utils';
import { LockUtils } from '@/utils/lock-utils';

export class EmailController {
    private userLocks: LockUtils = new LockUtils();
    private readonly REFRESH_TIMEOUT = 25000;

    constructor(
        private readonly authService: AuthService,
        private emailAnalysisService: EmailAnalysisService,
        private emailViewService: EmailViewService,
        private emailTargetedService: EmailTargetedService,
        private emailFullSyncService: EmailFullSyncService,
        private emailBaseService: EmailBaseService,
        private requestLogger: RequestLogger,
        private userRepository: UserRepository
    ) {}

    private async validateUser(req: Request): Promise<{ id: number; email: string }> {
        const user = req.user;
        if (!user || !user.email) {
            throw new Error('User not authenticated');
        }

        const dbUser = await this.userRepository.getUserByEmail(user.email);
        if (!dbUser || !dbUser.id) {
            logger.warn(`User not found in database: ${user.email}`);
            throw new Error('User not found in database');
        }

        return { id: dbUser.id, email: user.email };
    }

    private async processEmailGroupResult(result: any) {
        const stats = await this.emailViewService.getEmailStats();

        return {
            emailCount: result.group.emails?.length || 0,
            created: result.created,
            emailGroupId: result.emailGroupId,
            emailGroup: result.group,
            newEmails: result.newEmails,
            emailStats: stats,
            isNewGroup: result.created
        };
    }

    public findEmailsByEmailGroupId = async (req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('findEmailsByEmailGroupId', req);

            const { emailGroupId } = req.body;
            const user = await this.validateUser(req);

            const result = await this.emailTargetedService.findAndSyncEmailsByGroupId(
                req.emailService!,
                emailGroupId,
                user.id
            );

            if (!result.group) {
                return ResponseUtils.handleSuccess(
                    res,
                    `No emails found for email group ${emailGroupId}`,
                    {
                        emailCount: 0,
                        created: false,
                        emailGroupId,
                        newEmails: 0
                    }
                );
            }

            const data = await this.processEmailGroupResult({ ...result, emailGroupId });
            const message = result.created
                ? `Created new email group with ${result.group.emails?.length || 0} emails`
                : `Updated existing group. Added ${result.newEmails} new emails`;

            return ResponseUtils.handleSuccess(res, message, data);

        } catch (error) {
            return ResponseUtils.handleError(res, 'Failed to find emails by email group ID', error);
        }
    };

    public getEmailGroups = async (req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('getEmailGroups', req);

            const emailFetcher = req.emailService!;
            const user = await this.validateUser(req);
            const { startDate, endDate } = req.query;

            const result = await this.emailFullSyncService.syncAllEmails(
                emailFetcher,
                {
                    startDate: startDate as string,
                    endDate: endDate as string
                },
                user.id
            );

            const createdGroups: any[] = [];
            if (result.createdGroups && result.createdGroups.length > 0) {
                const groupPromises = result.createdGroups.map(groupId => 
                    this.emailBaseService.getUpdatedEmailGroup(groupId)
                );
                const groups = await Promise.all(groupPromises);
                createdGroups.push(...groups.filter(group => group !== null));
            }

            const viewStateResult = await this.emailViewService.handlePostSyncState();
            const stats = await this.emailViewService.getEmailStats();

            return ResponseUtils.handleSuccess(
                res,
                `Sync completed. Created: ${result.created}, Updated: ${result.updated}, New emails: ${result.newEmails}`,
                {
                    ...result,
                    createdGroups,
                    actualNewEmails: viewStateResult.newEmailIds.length,
                    emailStats: stats
                }
            );
        } catch (error) {
            return ResponseUtils.handleError(res, 'Error processing email data', error);
        }
    };

    public refreshEmailGroup = async (req: Request, res: Response): Promise<Response> => {
        const { emailGroupId } = req.body;
        const userEmail = req.user?.email;

        if (!userEmail) {
            return ResponseUtils.handleError(res, 'User not authenticated', null, 401);
        }

        const userLockKey = `${userEmail}_${emailGroupId}`;

        if (this.userLocks.hasLock(userLockKey)) {
            logger.warn(`User ${userEmail} already refreshing group: ${emailGroupId}`);

            return ResponseUtils.handleSuccess(res, 'Refresh already in progress', {
                inProgress: true,
                emailGroupId
            });
        }

        try {
            const result = await this.userLocks.acquireLock(
                userLockKey,
                () => this.performRefresh(req, emailGroupId),
                this.REFRESH_TIMEOUT
            );

            return ResponseUtils.handleSuccess(res, result.message, {
                ...result.data,
                inProgress: false
            });

        } catch (error: any) {
            logger.error(`Failed to refresh email group ${emailGroupId}:`, error);

            this.userLocks.forceRelease(userLockKey);

            if (error.message.includes('timeout')) {
                return ResponseUtils.handleError(
                    res,
                    'Refresh operation timed out. Please try again in a moment.',
                    null,
                    408
                );
            }

            return ResponseUtils.handleError(res, 'Failed to refresh email group', error);
        }
    };

    private async performRefresh(req: Request, emailGroupId: string): Promise<any> {
        this.requestLogger.logRequest('refreshEmailGroup', req);
        const user = await this.validateUser(req);

        const result = await this.emailTargetedService.findAndSyncEmailsByGroupId(
            req.emailService!,
            emailGroupId,
            user.id
        );

        if (!result.group) {
            throw new Error('Email group not found');
        }

        return {
            message: result.newEmails > 0 ?
                `Group refreshed. Found ${result.newEmails} new emails` :
                'Group up to date',
            data: {
                emailGroup: result.group,
                emailCount: result.group.emails?.length || 0,
                newEmails: result.newEmails,
                isNewGroup: result.created
            }
        };
    }

    public getAllEmailGroups = async (req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('getAllEmailGroups', req);

            const allGroups = await this.emailBaseService.getAllEmailGroupsWithEmails();
            const stats = await this.emailViewService.getEmailStats();

            return ResponseUtils.handleSuccess(
                res,
                `Found ${allGroups.length} email groups`,
                {
                    emailGroups: allGroups,
                    emailStats: stats,
                    total: allGroups.length
                }
            );
        } catch (error) {
            return ResponseUtils.handleError(res, 'Failed to get email groups', error);
        }
    };

    public getUpdatedEmailGroup = async (req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('getUpdatedEmailGroup', req);

            const { emailGroupId } = req.params;
            const updatedGroup = await this.emailBaseService.getUpdatedEmailGroup(emailGroupId);

            if (!updatedGroup) {
                return ResponseUtils.handleError(res, 'Email group not found', null, 404);
            }

            return ResponseUtils.handleSuccess(
                res,
                'Updated email group retrieved',
                { emailGroup: updatedGroup }
            );
        } catch (error) {
            return ResponseUtils.handleError(res, 'Failed to get updated email group', error);
        }
    };

    public approveEmailGroupSummary = async (req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('approveEmailGroupSummary', req);

            const { messageId } = req.body;
            const result = await this.emailAnalysisService.approveEmail(messageId);

            return ResponseUtils.handleSuccess(res, 'Email successfully approved', result);
        } catch (error) {
            return ResponseUtils.handleError(res, 'Failed to approve email', error);
        }
    };

    public getEmailAnalysis = async (req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('getEmailAnalysis', req);

            const { messageId } = req.params;
            const result = await this.emailAnalysisService.getEmailAnalysis(messageId);

            return ResponseUtils.handleSuccess(res, 'Email analysis retrieved', result);
        } catch (error) {
            return ResponseUtils.handleError(res, 'Failed to get email analysis', error);
        }
    };

    public getPendingAnalysis = async (_req: Request, res: Response): Promise<Response> => {
        try {
            this.requestLogger.logRequest('getPendingAnalysis', _req);
            const result = await this.emailAnalysisService.getPendingAnalysis();

            return ResponseUtils.handleSuccess(res, 'Pending analysis retrieved', result);
        } catch (error) {
            return ResponseUtils.handleError(res, 'Failed to get emails for analysis', error);
        }
    };

    public getAuthMiddleware() {
        return requireAuth(this.authService);
    }

    public getRoutes(): Router {
        const router = Router();

        router.post('/email-groups', this.getAuthMiddleware(), this.getEmailGroups);
        router.post('/find-by-email-group', this.getAuthMiddleware(), this.findEmailsByEmailGroupId);
        router.post('/refresh-email-group', this.getAuthMiddleware(), this.refreshEmailGroup);
        router.get('/all-email-groups', this.getAuthMiddleware(), this.getAllEmailGroups);
        router.get('/updated-group/:emailGroupId', this.getAuthMiddleware(), this.getUpdatedEmailGroup);
        router.post('/approve', this.getAuthMiddleware(), this.approveEmailGroupSummary);
        router.get('/pending-analysis', this.getAuthMiddleware(), this.getPendingAnalysis);
        router.get('/analysis/:messageId', this.getAuthMiddleware(), this.getEmailAnalysis);

        return router;
    }
}