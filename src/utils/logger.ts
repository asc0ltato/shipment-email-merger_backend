const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

export class Logger {
    private readonly level: string;

    constructor(level: string = 'info') {
        this.level = level;
    }

    private shouldLog(level: string): boolean {
        const levels = ['error', 'warn', 'info', 'debug'];
        return levels.indexOf(level) <= levels.indexOf(this.level);
    }

    private shouldOutput(): boolean {
        if (isProduction) {
            return false;
        }
        return isDevelopment;
    }

    public info(message: string, meta?: any): void {
        if (this.shouldLog('info') && this.shouldOutput()) {
            console.log(`[INFO] ${message}`, meta || '');
        }
    }

    public error(message: string, error?: any): void {
        if (this.shouldLog('error')) {
            if (isProduction) {
                console.error(`[ERROR] ${message}`);
            } else {
                console.error(`[ERROR] ${message}`, error || '');
            }
        }
    }

    public warn(message: string, meta?: any): void {
        if (this.shouldLog('warn')) {
            if (isProduction) {
                console.warn(`[WARN] ${message}`);
            } else {
                console.warn(`[WARN] ${message}`, meta || '');
            }
        }
    }

    public debug(message: string, meta?: any): void {
        if (this.shouldLog('debug') && isDevelopment) {
            console.debug(`[DEBUG] ${message}`, meta || '');
        }
    }
}

export const logger = new Logger(process.env.LOG_LEVEL || 'info');