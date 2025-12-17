import { logger } from '@/utils';
import { ValidationUtils } from '@/utils/validation.ts';

export class AuthValidationService {
    private validationService: ValidationUtils;

    constructor() {
        this.validationService = new ValidationUtils();
    }

    isValidCode(code: unknown): boolean {
        return this.validationService.isValidAuthCode(code as string);
    }

    resolveEmail(email: string, state: string): string {
        if (email) return email;

        if (state) {
            try {
                return Buffer.from(state, 'base64').toString('utf-8');
            } catch (e) {
                logger.error('Error decoding email from state:', e);
            }
        }

        throw new Error('Email is required for authentication');
    }
}