import { Sequelize } from 'sequelize';
import { initModels, Models } from '@/models';
import { IUser } from '@/models/auth';
import { logger } from '@/utils';

export class UserRepository {
    private models: Models;

    constructor(sequelize: Sequelize) {
        this.models = initModels(sequelize);
    }

    async saveUser(userData: Omit<IUser, 'id' | 'createdAt' | 'updatedAt'>): Promise<IUser> {
        try {
            const [savedUser] = await this.models.User.upsert({
                ...userData,
                lastSync: new Date()
            }, {
                conflictFields: ['email'],
                returning: true
            });

            logger.info(`User saved: ${userData.email}`);
            return this.mapToIUser(savedUser);
        } catch (error) {
            logger.error('Error saving user:', error);
            throw error;
        }
    }

    async getUserByEmail(email: string): Promise<IUser | null> {
        try {
            const user = await this.models.User.findOne({
                where: { email }
            });

            return user ? this.mapToIUser(user) : null;
        } catch (error) {
            logger.error('Error getting user by email:', error);
            throw error;
        }
    }

    async getAllActiveUsers(): Promise<IUser[]> {
        try {
            const users = await this.models.User.findAll({
                where: { isActive: true },
                order: [['lastSync', 'DESC']]
            });

            return users.map(user => this.mapToIUser(user));
        } catch (error) {
            logger.error('Error getting active users:', error);
            throw error;
        }
    }

    async updateAccessToken(email: string, accessToken: string): Promise<boolean> {
        try {
            const [affectedCount] = await this.models.User.update(
                {
                    accessToken,
                    lastSync: new Date()
                },
                { where: { email } }
            );

            return affectedCount > 0;
        } catch (error) {
            logger.error('Error updating access token:', error);
            throw error;
        }
    }

    async deactivateUser(email: string): Promise<boolean> {
        try {
            const [affectedCount] = await this.models.User.update(
                { isActive: false },
                { where: { email } }
            );

            if (affectedCount > 0) {
                logger.info(`User deactivated: ${email}`);
            }

            return affectedCount > 0;
        } catch (error) {
            logger.error('Error deactivating user:', error);
            throw error;
        }
    }

    private mapToIUser(user: any): IUser {
        return {
            id: user.id,
            email: user.email,
            accessToken: user.accessToken,
            refreshToken: user.refreshToken,
            lastSync: user.lastSync,
            isActive: user.isActive,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };
    }
}