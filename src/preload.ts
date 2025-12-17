import { config as dotenvConfig } from 'dotenv';
import { join } from 'path';

const envPath = join(process.cwd(), '.env.development');
dotenvConfig({ path: envPath });