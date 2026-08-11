import { describe, it, expect } from 'vitest';
import { loginSchema } from '../login.schema';

describe('loginSchema', () => {
  it('validates correct email and password', () => {
    const result = loginSchema.safeParse({
      email: 'admin@merchant.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty email', () => {
    const result = loginSchema.safeParse({
      email: '',
      password: 'password123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Email is required');
    }
  });

  it('rejects invalid email format', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'Please enter a valid email address',
      );
    }
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      email: 'admin@merchant.com',
      password: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Password is required');
    }
  });
});
