import * as fs from 'fs/promises';
import * as path from 'path';
import { LocalStorageAdapter } from '../adapters/local-storage.adapter';

describe('LocalStorageAdapter', () => {
  const tempDir = path.join(__dirname, 'tmp-local-storage');
  const publicUrlBase = 'http://localhost:3000/uploads';
  let adapter: LocalStorageAdapter;

  beforeEach(async () => {
    adapter = new LocalStorageAdapter({
      localRoot: tempDir,
      publicUrlBase,
    });
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('upload', () => {
    it('creates directory and writes file to disk', async () => {
      const key = 'tenants/tenant-1/products/item.png';
      const buffer = Buffer.from('mock image data');
      const options = {
        key,
        buffer,
        contentType: 'image/png',
        tenantId: 'tenant-1',
      };

      const result = await adapter.upload(options);

      const filePath = path.join(tempDir, key);
      const fileExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);

      expect(fileExists).toBe(true);

      const fileContent = await fs.readFile(filePath);
      expect(fileContent.toString()).toBe('mock image data');
      expect(result).toEqual({
        key,
        url: 'http://localhost:3000/uploads/tenants/tenant-1/products/item.png',
      });
    });
  });

  describe('getUrl', () => {
    it('returns public url formatted with base URL and path', () => {
      const key = 'tenants/tenant-1/avatars/user.png';
      const url = adapter.getUrl(key);

      expect(url).toBe(
        'http://localhost:3000/uploads/tenants/tenant-1/avatars/user.png',
      );
    });

    it('handles leading and trailing slashes correctly', () => {
      const adapterWithSlashes = new LocalStorageAdapter({
        localRoot: tempDir,
        publicUrlBase: 'http://localhost:3000/uploads/',
      });

      const url = adapterWithSlashes.getUrl('/tenants/tenant-1/file.txt');
      expect(url).toBe(
        'http://localhost:3000/uploads/tenants/tenant-1/file.txt',
      );
    });
  });

  describe('delete', () => {
    it('deletes the file from disk', async () => {
      const key = 'tenants/tenant-1/to-delete.txt';
      const filePath = path.join(tempDir, key);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, 'delete me');

      await adapter.delete(key);

      const fileExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);

      expect(fileExists).toBe(false);
    });

    it('handles non-existent file without throwing', async () => {
      const key = 'tenants/tenant-1/non-existent.txt';

      await expect(adapter.delete(key)).resolves.not.toThrow();
    });
  });
});
