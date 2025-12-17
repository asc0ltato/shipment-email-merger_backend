export const appConfig = {
    port: parseInt(process.env.PORT || '3001'),
    env: process.env.NODE_ENV || 'development',
    apiToken: process.env.INTERNAL_API_TOKEN || 'default-internal-token'
};