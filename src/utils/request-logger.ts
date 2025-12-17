import { Request } from 'express';
import { logger } from '@/utils/index.ts';

export class RequestLogger {
    logRequest(operation: string, req: Request): void {
        logger.info(`Controller operation: ${operation}`, {
            method: req.method,
            path: req.path,
            params: req.params,
            query: req.query,
            body: this.sanitizeRequestBody(req.body)
        });
    }

    private sanitizeRequestBody(body: any): any {
        const sanitized = { ...body };
        if (sanitized.password) sanitized.password = '***';
        if (sanitized.accessToken) sanitized.accessToken = '***';
        if (sanitized.authorization) sanitized.authorization = '***';
        return sanitized;
    }
}