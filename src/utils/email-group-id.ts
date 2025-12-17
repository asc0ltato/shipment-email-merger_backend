import { logger } from './logger';

export class EmailGroupId {
    private readonly patterns = [
        /\bShipment\s*[#]\s*(\d{6,8})\b/gi
    ];

    hasEmailGroupId(text: string): boolean {
        if (!text) return false;
        return this.extractEmailGroupIdFromText(text) !== null;
    }

    extractEmailGroupIdFromText(text: string): string | null {
        if (!text) return null;

        for (const pattern of this.patterns) {
            const matches = text.match(pattern);
            if (matches && matches.length > 0) {
                const digitMatch = matches[0].match(/\d{6,8}/);
                const id = digitMatch ? digitMatch[0] : null;

                if (id) {
                    logger.debug(`Found email group ID: ${id}`);
                    return id;
                }
            }
        }
        return null;
    }

    normalizeEmailGroupId(id: string): string {
        if (!id) return id;

        const match = id.match(/\d{6,8}/);
        return match ? match[0] : id;
    }

    findBestFuzzyMatch(id: string, existingIds: string[], similarityThreshold: number = 0.8): string | null {
        const normalizedId = this.normalizeEmailGroupId(id);

        if (existingIds.includes(normalizedId)) {
            return normalizedId;
        }

        let bestMatch: string | null = null;
        let bestScore = 0;

        for (const existingId of existingIds) {
            const similarity = this.calculateSimilarity(normalizedId, existingId);
            if (similarity > bestScore && similarity >= similarityThreshold) {
                bestScore = similarity;
                bestMatch = existingId;
            }
        }

        if (bestMatch) {
            logger.debug(`Fuzzy match: ${normalizedId} -> ${bestMatch} (score: ${bestScore.toFixed(2)})`);
        }

        return bestMatch;
    }

    private calculateSimilarity(str1: string, str2: string): number {
        // Если обе строки пустые - 100% схожести
        if (str1 === str2) return 1.0;
        if (str1.length === 0 || str2.length === 0) return 0.0;
        
        // Вычисляем расстояние Левенштейна
        const distance = this.levenshteinDistance(str1, str2);
        
        // Находим максимальную длину для нормализации
        const maxLength = Math.max(str1.length, str2.length);
        
        // Схожесть = 1 - (расстояние / максимальная длина)
        // Минимальное значение 0, максимальное 1
        const similarity = 1 - (distance / maxLength);
        
        // Округляем до 2 знаков для читаемости
        return Math.max(0, Math.min(1, similarity));
    }
    
    private levenshteinDistance(str1: string, str2: string): number {
        const m = str1.length;
        const n = str2.length;
        
        // Создаём матрицу (m+1) x (n+1)
        const dp: number[][] = Array(m + 1)
            .fill(null)
            .map(() => Array(n + 1).fill(0));
        
        // Инициализация первой строки и первого столбца
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        
        // Заполнение матрицы
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,      // удаление
                    dp[i][j - 1] + 1,      // вставка
                    dp[i - 1][j - 1] + cost // замена
                );
            }
        }
        
        return dp[m][n];
    }
}