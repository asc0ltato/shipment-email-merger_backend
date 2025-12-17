import { logger } from './logger';

export class EmailUtilsService {
    getAddressText(address: any): string {
        if (!address) return '';
        if (Array.isArray(address)) {
            return address.map(addr => addr.text || addr.address || '').join(', ');
        }
        return address.text || address.address || '';
    }

    convertToIMAPDate(dateString: string): string {
        if (!dateString) return '';

        const parts = dateString.split('-');
        if (parts.length === 3) {
            const day = parts[0];
            const month = parts[1];
            const year = parts[2];

            if (day.length === 2 && month.length === 2 && year.length === 4) {
                const converted = `${year}-${month}-${day}`;
                logger.debug(`Converted DD-MM-YYYY ${dateString} -> YYYY-MM-DD ${converted}`);
                return converted;
            }
        }

        if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
            logger.debug(`Date is already in YYYY-MM-DD format: ${dateString}`);
            return dateString;
        }

        logger.warn(`Unknown date format: "${dateString}", using as is`);
        return dateString;
    }

    generateXOAuth2Token(email: string, accessToken: string): string {
        const authString = `user=${email}\x01auth=Bearer ${accessToken}\x01\x01`;
        return Buffer.from(authString).toString('base64');
    }

    extractEmailDomain(email: string): string {
        return email.split('@')[1] || '';
    }

    isSpamDomain(domain: string): boolean {
        const spamDomains = [
            'linkedin.com',
            'indeed.com',
            'hh.ru',
            'career.habr.com',
            'newsletter',
            'promo'
        ];
        return spamDomains.some(spamDomain => domain.includes(spamDomain));
    }
}