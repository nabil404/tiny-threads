import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useImageUploadManager,
  type UseImageUploadManagerOptions,
  type ImageRecord,
} from '../useImageUploadManager';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function image(overrides: Partial<ImageRecord> = {}): ImageRecord {
  return {
    id: 'img-1',
    url: 'https://cdn/img.webp',
    altText: null,
    sortOrder: 0,
    isPrimary: true,
    ...overrides,
  };
}

function makeOptions(
  overrides: Partial<UseImageUploadManagerOptions> = {},
): UseImageUploadManagerOptions {
  return {
    concurrency: 5,
    uploadFile: vi.fn().mockResolvedValue(image()),
    deleteImage: vi.fn().mockResolvedValue(undefined),
    reorderImages: vi.fn().mockResolvedValue([]),
    setPrimaryImage: vi.fn().mockResolvedValue(image()),
    ...overrides,
  };
}

if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
}
if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = vi.fn();
}

describe('useImageUploadManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues files without uploading when no group context has been set', () => {
    const options = makeOptions();
    const { result } = renderHook(() => useImageUploadManager(options));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    act(() => {
      result.current.addFiles('group-key', [file]);
    });

    expect(result.current.getItems('group-key')).toHaveLength(1);
    expect(result.current.getItems('group-key')[0].status).toBe('queued');
    expect(options.uploadFile).not.toHaveBeenCalled();
  });

  it('starts uploading queued files once group context is set', async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useImageUploadManager(options));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    act(() => {
      result.current.addFiles('group-key', [file]);
      result.current.setGroupContext('group-key', 'owner-1', 'group-1');
    });

    await waitFor(() =>
      expect(result.current.getItems('group-key')[0].status).toBe('done'),
    );
    expect(options.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'owner-1', groupId: 'group-1', file }),
    );
  });

  it('caps concurrent uploads at the configured limit', async () => {
    const d1 = deferred<ImageRecord>();
    const d2 = deferred<ImageRecord>();
    const uploadFile = vi
      .fn()
      .mockReturnValueOnce(d1.promise)
      .mockReturnValueOnce(d2.promise);
    const options = makeOptions({ concurrency: 1, uploadFile });
    const { result } = renderHook(() => useImageUploadManager(options));
    const fileA = new File(['a'], 'a.png', { type: 'image/png' });
    const fileB = new File(['b'], 'b.png', { type: 'image/png' });

    act(() => {
      result.current.setGroupContext('group-key', 'owner-1', 'group-1');
      result.current.addFiles('group-key', [fileA, fileB]);
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
    expect(
      result.current.getItems('group-key').find((i) => i.file === fileB)?.status,
    ).toBe('queued');

    await act(async () => {
      d1.resolve(image({ id: 'img-a' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(2));
    d2.resolve(image({ id: 'img-b', isPrimary: false, sortOrder: 1 }));
  });

  it('sets an item to error status when the upload rejects', async () => {
    const options = makeOptions({
      uploadFile: vi.fn().mockRejectedValue(new Error('Too large')),
    });
    const { result } = renderHook(() => useImageUploadManager(options));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    act(() => {
      result.current.setGroupContext('group-key', 'owner-1', 'group-1');
      result.current.addFiles('group-key', [file]);
    });

    await waitFor(() =>
      expect(result.current.getItems('group-key')[0].status).toBe('error'),
    );
    expect(result.current.getItems('group-key')[0].errorMessage).toBe(
      'Too large',
    );
  });

  it('adds a rejected file directly as an error item without uploading', () => {
    const options = makeOptions();
    const { result } = renderHook(() => useImageUploadManager(options));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    act(() => {
      result.current.addRejectedFile('group-key', file, 'File exceeds 10MB');
    });

    expect(result.current.getItems('group-key')[0]).toMatchObject({
      status: 'error',
      errorMessage: 'File exceeds 10MB',
    });
    expect(options.uploadFile).not.toHaveBeenCalled();
  });

  it('removing a done item calls deleteImage and drops it from the list', async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useImageUploadManager(options));

    act(() => {
      result.current.hydrateExisting('group-key', [image({ id: 'img-1' })]);
      result.current.setGroupContext('group-key', 'owner-1', 'group-1');
    });

    act(() => {
      result.current.removeItem('group-key', 'image-img-1');
    });

    expect(result.current.getItems('group-key')).toHaveLength(0);
    await waitFor(() =>
      expect(options.deleteImage).toHaveBeenCalledWith({
        ownerId: 'owner-1',
        groupId: 'group-1',
        imageId: 'img-1',
      }),
    );
  });

  it('removing an error item does not call deleteImage', () => {
    const options = makeOptions();
    const { result } = renderHook(() => useImageUploadManager(options));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    act(() => {
      result.current.addRejectedFile('group-key', file, 'bad file');
    });
    const clientId = result.current.getItems('group-key')[0].clientId;

    act(() => {
      result.current.removeItem('group-key', clientId);
    });

    expect(result.current.getItems('group-key')).toHaveLength(0);
    expect(options.deleteImage).not.toHaveBeenCalled();
  });

  it('retryItem resets an error item to queued and re-uploads', async () => {
    const uploadFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail once'))
      .mockResolvedValueOnce(image());
    const options = makeOptions({ uploadFile });
    const { result } = renderHook(() => useImageUploadManager(options));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    act(() => {
      result.current.setGroupContext('group-key', 'owner-1', 'group-1');
      result.current.addFiles('group-key', [file]);
    });
    await waitFor(() =>
      expect(result.current.getItems('group-key')[0].status).toBe('error'),
    );

    const clientId = result.current.getItems('group-key')[0].clientId;
    act(() => {
      result.current.retryItem('group-key', clientId);
    });

    await waitFor(() =>
      expect(result.current.getItems('group-key')[0].status).toBe('done'),
    );
    expect(uploadFile).toHaveBeenCalledTimes(2);
  });

  it('waitForIdle resolves once all queued/uploading items for the given keys settle', async () => {
    const d = deferred<ImageRecord>();
    const options = makeOptions({ uploadFile: vi.fn().mockReturnValue(d.promise) });
    const { result } = renderHook(() => useImageUploadManager(options));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    act(() => {
      result.current.setGroupContext('group-key', 'owner-1', 'group-1');
      result.current.addFiles('group-key', [file]);
    });

    let resolved = false;
    const idlePromise = result.current
      .waitForIdle(['group-key'])
      .then(() => {
        resolved = true;
      });

    expect(resolved).toBe(false);

    d.resolve(image());
    await idlePromise;
    expect(resolved).toBe(true);
  });
});
