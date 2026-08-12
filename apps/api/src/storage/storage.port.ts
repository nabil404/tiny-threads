export interface UploadFileOptions {
  key: string;
  buffer: Buffer;
  contentType: string;
  tenantId: string;
}

export interface StoragePort {
  upload(options: UploadFileOptions): Promise<{ key: string; url: string }>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}

export const STORAGE_PORT = Symbol('STORAGE_PORT');
