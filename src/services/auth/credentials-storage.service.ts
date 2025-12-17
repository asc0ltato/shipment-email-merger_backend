import { User } from '@/models/auth';
import { UserRepository } from '@/repositories/user.repository';
import { logger } from '@/utils';
import { Sequelize } from "sequelize";

export class CredentialsStorageService {
    private static instance: CredentialsStorageService;
    private userRepository: UserRepository;

    private constructor(sequelize: Sequelize) {
        this.userRepository = new UserRepository(sequelize);
        logger.info('Database credentials storage initialized');
    }

    public static getInstance(sequelize?: Sequelize): CredentialsStorageService {
        if (!CredentialsStorageService.instance && sequelize) {
            CredentialsStorageService.instance = new CredentialsStorageService(sequelize);
        }
        return CredentialsStorageService.instance;
    }

    public async saveCredentials(email: string, accessToken: string, providerConfig: any, refreshToken?: string): Promise<void> {
        try {
            await this.userRepository.saveUser({
                email,
                accessToken,
                refreshToken,
                lastSync: new Date(),
                isActive: true
            });

            logger.info(`Credentials saved to database for: ${email}`);
        } catch (error) {
            logger.error('Error saving credentials to database:', error);
            throw error;
        }
    }

    public async getAllActiveCredentials(): Promise<User[]> {
        try {
            const users = await this.userRepository.getAllActiveUsers();
            return users;
        } catch (error) {
            logger.error('Error getting active credentials from database:', error);
            throw error;
        }
    }

    public async updateAccessToken(email: string, newAccessToken: string): Promise<void> {
        try {
            const success = await this.userRepository.updateAccessToken(email, newAccessToken);
            if (success) {
                logger.info(`Access token updated in database for: ${email}`);
            } else {
                logger.warn(`No credentials found to update for: ${email}`);
            }
        } catch (error) {
            logger.error('Error updating access token in database:', error);
            throw error;
        }
    }

    public async deactivateCredentials(email: string): Promise<void> {
        try {
            const success = await this.userRepository.deactivateUser(email);
            if (success) {
                logger.info(`Credentials deactivated in database for: ${email}`);
            } else {
                logger.warn(`No active credentials found to deactivate for: ${email}`);
            }
        } catch (error) {
            logger.error('Error deactivating credentials in database:', error);
            throw error;
        }
    }

    public async getCredentialsByEmail(email: string): Promise<User | null> {
        try {
            return await this.userRepository.getUserByEmail(email);
        } catch (error) {
            logger.error('Error getting credentials by email from database:', error);
            throw error;
        }
    }
}