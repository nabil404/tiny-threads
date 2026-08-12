import { storageConfig } from '../storage.config';

describe('storageConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns default configuration when env vars are not set', () => {
    delete process.env.STORAGE_DRIVER;
    delete process.env.STORAGE_LOCAL_ROOT;
    delete process.env.STORAGE_PUBLIC_URL_BASE;
    delete process.env.AWS_REGION;
    delete process.env.AWS_BUCKET;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_ENDPOINT;

    const config = storageConfig();

    expect(config).toEqual({
      driver: 'local',
      localRoot: './uploads',
      publicUrlBase: 'http://localhost:8000/uploads',
      aws: {
        region: 'us-east-1',
        bucket: '',
        accessKeyId: '',
        secretAccessKey: '',
        endpoint: undefined,
      },
    });
  });

  it('uses environment variables when provided', () => {
    process.env.STORAGE_DRIVER = 's3';
    process.env.STORAGE_LOCAL_ROOT = '/custom/uploads';
    process.env.STORAGE_PUBLIC_URL_BASE = 'https://cdn.example.com';
    process.env.AWS_REGION = 'eu-west-1';
    process.env.AWS_BUCKET = 'my-custom-bucket';
    process.env.AWS_ACCESS_KEY_ID = 'key123';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret456';
    process.env.AWS_ENDPOINT = 'http://localhost:4566';

    const config = storageConfig();

    expect(config).toEqual({
      driver: 's3',
      localRoot: '/custom/uploads',
      publicUrlBase: 'https://cdn.example.com',
      aws: {
        region: 'eu-west-1',
        bucket: 'my-custom-bucket',
        accessKeyId: 'key123',
        secretAccessKey: 'secret456',
        endpoint: 'http://localhost:4566',
      },
    });
  });
});
