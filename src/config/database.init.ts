import { Sequelize } from 'sequelize';
import { databaseConfig } from './database.config';
import { initModels } from '@/models';
import { logger } from '@/utils';

class Database {
    private static instance: Database;
    private readonly sequelize: Sequelize;
    private isInitialized = false;

    private constructor() {
        this.sequelize = new Sequelize({
            ...databaseConfig,
            logging: (msg) => logger.debug(msg),
        });

        initModels(this.sequelize);
    }

    public static getInstance(): Database {
        if (!Database.instance) {
            Database.instance = new Database();
        }
        return Database.instance;
    }

    private async createDatabaseIfNotExists(): Promise<void> {
        const tempSequelize = new Sequelize({
            ...databaseConfig,
            database: 'postgres',
        });

        try {
            const databaseName = databaseConfig.database;
            const [results] = await tempSequelize.query(
                `SELECT 1 FROM pg_database WHERE datname = '${databaseName}'`
            );

            if ((results as any[]).length === 0) {
                await tempSequelize.query(`CREATE DATABASE "${databaseName}"`);
                logger.info(`Database "${databaseName}" created successfully`);
            } else {
                logger.info(`Database "${databaseName}" already exists`);
            }
        } finally {
            await tempSequelize.close();
        }
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            logger.debug('Database already initialized');
            return;
        }

        try {
            await this.createDatabaseIfNotExists();

            await this.sequelize.authenticate();
            logger.info('Database connection established successfully');

            await this.sequelize.sync({ force: false, alter: false });
            logger.info('All models synchronized with database');

            this.isInitialized = true;
            logger.info('Database initialization completed');
        } catch (error) {
            logger.error('Failed to connect to database:', error);
            throw new Error('Failed to connect to database');
        }
    }

    public getIsInitialized(): boolean {
        return this.isInitialized;
    }

    public getSequelize(): Sequelize {
        return this.sequelize;
    }
}

export const database = Database.getInstance();