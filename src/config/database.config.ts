import { Dialect } from 'sequelize';
import { logger } from '@/utils/logger';

const sqlLogger = (query: string): void => {
    if (process.env.NODE_ENV === 'development') {
        logger.debug('SQL Query:', query);
    }
};

export const databaseConfig = {
    dialect: (process.env.DB_DIALECT || 'postgres') as Dialect,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'shipments',
    logging: process.env.NODE_ENV === 'development' ? sqlLogger : false,
};