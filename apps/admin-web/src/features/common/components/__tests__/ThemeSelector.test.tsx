import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import appReducer from '../../../../store/slices/appSlice';
import { ThemeSelector } from '../ThemeSelector';

function createMockStore(initialTheme = 'dark') {
  return configureStore({
    reducer: {
      app: appReducer,
    },
    preloadedState: {
      app: {
        tenantId: 'tenant-1',
        tenantName: 'Test Tenant',
        theme: initialTheme,
      },
    },
  });
}

describe('ThemeSelector (Smart Component connected to Redux)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders active theme from Redux state', () => {
    const store = createMockStore('emerald');
    render(
      <Provider store={store}>
        <ThemeSelector />
      </Provider>
    );

    const button = screen.getByRole('button', { name: /select theme/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Emerald');
  });

  it('dispatches setTheme action to Redux store when theme option is selected', () => {
    const store = createMockStore('dark');
    render(
      <Provider store={store}>
        <ThemeSelector />
      </Provider>
    );

    const button = screen.getByRole('button', { name: /select theme/i });
    fireEvent.click(button);

    const midnightOption = screen.getByRole('button', { name: /midnight/i });
    fireEvent.click(midnightOption);

    expect(store.getState().app.theme).toBe('midnight');
    expect(document.documentElement.getAttribute('data-theme')).toBe('midnight');
  });
});
