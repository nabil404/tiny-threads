import { validate, EnvironmentVariables } from '../env.validation';

function validEnv(): Record<string, string> {
  return {
    DATABASE_URL: 'postgresql://app_runtime:pw@localhost:5432/tiny_threads',
    DATABASE_URL_MIGRATIONS:
      'postgresql://app_owner:pw@localhost:5432/tiny_threads',
    JWT_SECRET: 'jwt-secret',
    OAUTH_STATE_SECRET: 'oauth-state-secret',
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
    PLATFORM_BASE_URL: 'http://localhost:3000',
  };
}

describe('validate', () => {
  it('returns an EnvironmentVariables instance given a complete valid env', () => {
    const result = validate(validEnv());

    expect(result).toBeInstanceOf(EnvironmentVariables);
    expect(result.DATABASE_URL).toBe(validEnv().DATABASE_URL);
  });

  it('passes when optional NODE_ENV and PORT are omitted', () => {
    expect(() => validate(validEnv())).not.toThrow();
  });

  it('accepts a valid NODE_ENV value', () => {
    expect(() =>
      validate({ ...validEnv(), NODE_ENV: 'production' }),
    ).not.toThrow();
  });

  it('throws when NODE_ENV is set to an invalid value', () => {
    expect(() => validate({ ...validEnv(), NODE_ENV: 'staging' })).toThrow();
  });

  it.each([
    'DATABASE_URL',
    'DATABASE_URL_MIGRATIONS',
    'JWT_SECRET',
    'OAUTH_STATE_SECRET',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'PLATFORM_BASE_URL',
  ])('throws when %s is missing', (key) => {
    const env = validEnv() as Record<string, string | undefined>;
    delete env[key];

    expect(() => validate(env)).toThrow();
  });

  it.each([
    'DATABASE_URL',
    'JWT_SECRET',
    'OAUTH_STATE_SECRET',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'PLATFORM_BASE_URL',
  ])('throws when %s is an empty string', (key) => {
    const env = { ...validEnv(), [key]: '' };

    expect(() => validate(env)).toThrow();
  });
});
