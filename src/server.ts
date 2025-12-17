import './preload';
import app from './app';
import { appConfig } from './config/app.config';
import { logger } from '@/utils';
import { createServer } from 'http';
import { WebSocketService } from './services/websocket/websocket.service';

const server = createServer(app);
const wsService = WebSocketService.getInstance();
wsService.initialize(server);

server.listen(appConfig.port, () => {
    logger.info(`Server running on port ${appConfig.port}`);
    logger.info(`Environment: ${appConfig.env}`);
    logger.info(`Health check: http://backend:${appConfig.port}/api/health`);
    logger.info(`WebSocket server: ws://backend:${appConfig.port}/ws/approved-summaries`);
});