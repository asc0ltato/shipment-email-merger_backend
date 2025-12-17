import { Response } from 'express';
import { IEmailGroup } from '@/models/email-group';
import { ShipmentRequest } from '@/models/summary';
import { logger } from '@/utils';

export class SSEService {
    private static instance: SSEService | null = null;
    private clients: Set<Response> = new Set();

    private constructor() {}

    public static getInstance(): SSEService {
        if (!SSEService.instance) {
            SSEService.instance = new SSEService();
        }
        return SSEService.instance;
    }

    public addClient(res: Response): void {
        this.clients.add(res);
        logger.info(`SSE client connected. Total clients: ${this.clients.size}`);
    }

    public removeClient(res: Response): void {
        if (this.clients.delete(res)) {
            logger.info(`SSE client disconnected. Total clients: ${this.clients.size}`);
        }
    }

    public sendApprovedSummary(emailGroup: IEmailGroup): void {
        if (this.clients.size === 0) {
            return;
        }

        try {
            let shipmentData: ShipmentRequest | null = null;

            if (emailGroup.summary && emailGroup.summary.status === 'approved') {
                shipmentData = (emailGroup.summary as any).shipment_data;
            } else if (emailGroup.summaries) {
                const approvedSummary = emailGroup.summaries.find(s => s.status === 'approved');
                shipmentData = approvedSummary ? (approvedSummary as any).shipment_data : null;
            }

            if (!shipmentData) {
                return;
            }

            const payload = JSON.stringify({
                emailGroupId: emailGroup.emailGroupId,
                shipment_data: shipmentData
            });

            const deadClients: Response[] = [];

            this.clients.forEach(res => {
                try {
                    res.write(`event: approved_summary\n`);
                    res.write(`data: ${payload}\n\n`);
                } catch (error) {
                    logger.warn('Error sending SSE to client, marking as disconnected:', error);
                    deadClients.push(res);
                }
            });

            deadClients.forEach(res => this.removeClient(res));

            logger.info(
                `SSE: sent approved summary for ${emailGroup.emailGroupId} to ${this.clients.size} clients`
            );
        } catch (error) {
            logger.error('Error in SSE sendApprovedSummary:', error);
        }
    }
}