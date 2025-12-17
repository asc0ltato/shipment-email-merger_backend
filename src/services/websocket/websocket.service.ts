import { WebSocket, WebSocketServer } from 'ws';
import { logger } from '@/utils';
import { IEmailGroup } from '@/models/email-group';
import { ShipmentRequest } from '@/models/summary';

export class WebSocketService {
    private static instance: WebSocketService | null = null;
    private wss: WebSocketServer | null = null;
    private clients: Set<WebSocket> = new Set();

    private constructor() {}

    public static getInstance(): WebSocketService {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }

    public initialize(server: any): void {
        this.wss = new WebSocketServer({ 
            server,
            path: '/ws/approved-summaries'
        });

        this.wss.on('connection', (ws: WebSocket) => {
            logger.info('WebSocket client connected');
            this.clients.add(ws);

            ws.on('close', () => {
                logger.info('WebSocket client disconnected');
                this.clients.delete(ws);
            });

            ws.on('error', (error: Error) => {
                logger.error('WebSocket error:', error);
                this.clients.delete(ws);
            });
        });

        logger.info('WebSocket server initialized on /ws/approved-summaries');
    }

    public sendApprovedSummary(emailGroup: IEmailGroup): void {
        if (!this.wss || this.clients.size === 0) {
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
            
            const message = JSON.stringify({
                type: 'approved_summary',
                data: {
                    shipment_data: shipmentData
                }
            });

            const deadClients: WebSocket[] = [];
            
            this.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    try {
                        client.send(message);
                    } catch (error) {
                        logger.error('Error sending WebSocket message:', error);
                        deadClients.push(client);
                    }
                } else {
                    deadClients.push(client);
                }
            });

            deadClients.forEach(client => this.clients.delete(client));

            logger.info(`Sent approved summary for ${emailGroup.emailGroupId} to ${this.clients.size} clients`);
        } catch (error) {
            logger.error('Error in sendApprovedSummary:', error);
        }
    }

    public getConnectedClientsCount(): number {
        return this.clients.size;
    }
}