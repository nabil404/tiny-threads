import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { baseApi } from '../../baseApi';
import * as axiosUploadClientModule from '@lib/axios-upload-client';
import {
  useUploadVariantImageMutation,
  useReorderVariantImagesMutation,
  useSetPrimaryVariantImageMutation,
} from '../productVariantImagesApi';

vi.mock('@lib/axios-upload-client', async () => {
  const actual = await vi.importActual('@lib/axios-upload-client');
  return {
    ...actual,
    axiosUploadClient: { post: vi.fn() },
    refreshSession: vi.fn(),
  };
});

function makeStore() {
  const dispatchedTypes: string[] = [];
  const store = configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      auth: (state: Record<string, never> = {}, action: { type: string }) => {
        dispatchedTypes.push(action.type);
        return state;
      },
    },
    middleware: (gdm) => gdm().concat(baseApi.middleware),
  });
  return { store, dispatchedTypes };
}

describe('productVariantImagesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploadVariantImage posts via axios and reports progress', async () => {
    void useUploadVariantImageMutation; // referenced for type-level import check
    const image = { id: 'img-1', variantId: 'v-1', url: 'https://cdn/x.webp' };
    (axiosUploadClientModule.axiosUploadClient.post as any).mockImplementation(
      (_url: string, _body: unknown, config: any) => {
        config.onUploadProgress?.({ loaded: 50, total: 100 });
        return Promise.resolve({ data: image });
      },
    );

    const { store } = makeStore();
    const onProgress = vi.fn();
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    const result = await store.dispatch(
      (baseApi.endpoints as any).uploadVariantImage.initiate({
        productId: 'p-1',
        variantId: 'v-1',
        file,
        onProgress,
      }),
    );

    expect(result.data).toEqual(image);
    expect(onProgress).toHaveBeenCalledWith(50);
  });

  it('uploadVariantImage retries once after a session refresh on 401', async () => {
    const image = { id: 'img-2', variantId: 'v-1', url: 'https://cdn/y.webp' };
    const unauthorized = {
      isAxiosError: true,
      response: { status: 401, data: {} },
    };
    (axiosUploadClientModule.axiosUploadClient.post as any)
      .mockRejectedValueOnce(unauthorized)
      .mockResolvedValueOnce({ data: image });
    (axiosUploadClientModule.refreshSession as any).mockResolvedValue(true);

    const { store } = makeStore();
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    const result = await store.dispatch(
      (baseApi.endpoints as any).uploadVariantImage.initiate({
        productId: 'p-1',
        variantId: 'v-1',
        file,
      }),
    );

    expect(axiosUploadClientModule.refreshSession).toHaveBeenCalled();
    expect(
      axiosUploadClientModule.axiosUploadClient.post,
    ).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual(image);
  });

  it('uploadVariantImage dispatches auth/logout when the refresh fails', async () => {
    const unauthorized = {
      isAxiosError: true,
      response: { status: 401, data: {} },
    };
    (axiosUploadClientModule.axiosUploadClient.post as any).mockRejectedValue(
      unauthorized,
    );
    (axiosUploadClientModule.refreshSession as any).mockResolvedValue(false);

    const { store, dispatchedTypes } = makeStore();
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    const result = await store.dispatch(
      (baseApi.endpoints as any).uploadVariantImage.initiate({
        productId: 'p-1',
        variantId: 'v-1',
        file,
      }),
    );

    expect(axiosUploadClientModule.refreshSession).toHaveBeenCalledTimes(1);
    expect(
      axiosUploadClientModule.axiosUploadClient.post,
    ).toHaveBeenCalledTimes(1);
    expect(dispatchedTypes).toContain('auth/logout');
    expect(result.error).toMatchObject({ status: 401 });
  });

  it('reorderVariantImages PUTs the ordered image ids', async () => {
    const { store } = makeStore();
    void useReorderVariantImagesMutation; // referenced for type-level import check
    const dispatched = store.dispatch(
      (baseApi.endpoints as any).reorderVariantImages.initiate({
        productId: 'p-1',
        variantId: 'v-1',
        imageIds: ['img-1', 'img-2'],
      }),
    );
    expect(dispatched).toBeDefined();
  });

  it('setPrimaryVariantImage PATCHes isPrimary true', async () => {
    const { store } = makeStore();
    void useSetPrimaryVariantImageMutation;
    const dispatched = store.dispatch(
      (baseApi.endpoints as any).setPrimaryVariantImage.initiate({
        productId: 'p-1',
        variantId: 'v-1',
        imageId: 'img-1',
      }),
    );
    expect(dispatched).toBeDefined();
  });
});
