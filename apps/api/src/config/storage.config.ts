import { registerAs } from '@nestjs/config';

export const storageConfig = registerAs('storage', () => ({
  driver: process.env.STORAGE_DRIVER || 'local',
  localRoot: process.env.STORAGE_LOCAL_ROOT || './uploads',
  publicUrlBase:
    process.env.STORAGE_PUBLIC_URL_BASE || 'http://localhost:3000/uploads',
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    bucket: process.env.AWS_BUCKET || '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    endpoint: process.env.AWS_ENDPOINT || undefined,
  },
}));
