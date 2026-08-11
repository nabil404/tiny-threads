import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { store } from '@store/index';
import App from '../App';
import * as authApiHooks from '@store/api/endpoints/authApi';

describe('App root with RouterProvider', () => {
  it('renders login page when unauthenticated after bootstrap check completes', async () => {
    const mockUnwrapRefresh = vi.fn().mockRejectedValue(new Error('Unauthorized'));
    const mockRefresh = vi.fn().mockReturnValue({ unwrap: mockUnwrapRefresh });
    vi.spyOn(authApiHooks, 'useRefreshMutation').mockReturnValue([
      mockRefresh as any,
      { isLoading: false } as any,
    ]);

    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /sign in/i }),
      ).toBeInTheDocument();
    });
  });
});
