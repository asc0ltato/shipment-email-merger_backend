export class ValidationUtils {
    isValidAuthCode(code: string): boolean {
        return code.length >= 10;
    }

    normalizeAndValidateEmailGroupId(emailGroupId: string): string | null {
        if (!emailGroupId) return null;

        let normalized = emailGroupId.toUpperCase();
        normalized = normalized.replace(/[–—‒―‐−－]/g, '-');
        normalized = normalized.replace(/\s+/g, '-');
        normalized = normalized.replace(/-+/g, '-');
        normalized = normalized.replace(/^-|-$/g, '');

        const match = normalized.match(/([A-Z]{2})-?(\d{6,8})/);
        if (match) {
            return `${match[1]}-${match[2]}`;
        }

        return null;
    }
}