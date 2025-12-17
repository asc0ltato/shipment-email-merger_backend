import { Response } from 'express';
import { logger } from './logger';

export class ResponseUtils {
    public static handleSuccess(res: Response, message: string, data: any = null): Response {
        const response: any = {
            success: true,
            message
        };

        if (data !== null) {
            response.data = data;
        }

        return res.json(response);
    }

    public static handleError(
        res: Response,
        message: string,
        error: any,
        statusCode: number = 500
    ): Response {
        logger.error(`Controller error: ${message}`, error);

        return res.status(statusCode).json({
            success: false,
            message,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}