import { HashingService } from '../services/hashing.service';

describe('HashingService', () => {
  const service = new HashingService();

  it('hashes a plaintext value into something other than the plaintext', async () => {
    const hash = await service.hash('correct horse battery staple');
    expect(hash).not.toEqual('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies a matching plaintext against its hash', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(
      service.verify(hash, 'correct horse battery staple'),
    ).resolves.toBe(true);
  });

  it('rejects a non-matching plaintext', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(service.verify(hash, 'wrong password')).resolves.toBe(false);
  });
});
