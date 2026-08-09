import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import appReducer from '../../store/slices/appSlice';
import { ThemeSelect } from './theme-select';
import { THEMES } from '../../theme/themes';

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

describe('ThemeSelect', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('renders active theme button', () => {
    const store = createMockStore('dark');
    render(
      <Provider store={store}>
        <ThemeSelect />
      </Provider>
    );

    const button = screen.getByRole('button', { name: /select theme/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Dark');
  });

  it('opens dropdown menu when clicked', () => {
    const store = createMockStore('dark');
    render(
      <Provider store={store}>
        <ThemeSelect />
      </Provider>
    );

    const button = screen.getByRole('button', { name: /select theme/i });
    fireEvent.click(button);

    expect(screen.getByText('Select Theme')).toBeInTheDocument();
    THEMES.forEach((theme) => {
      expect(screen.getAllByText(theme.name).length).toBeGreaterThan(0);
      expect(screen.getByText(theme.description)).toBeInTheDocument();
    });
  });

  it('dispatches setTheme and closes dropdown when an option is clicked', () => {
    const store = createMockStore('dark');
    render(
      <Provider store={store}>
        <ThemeSelect />
      </Provider>
    );

    const button = screen.getByRole('button', { name: /select theme/i });
    fireEvent.click(button);

    const emeraldOption = screen.getByRole('button', { name: /emerald/i });
    fireEvent.click(emeraldOption);

    expect(store.getState().app.theme).toBe('emerald');
    expect(screen.queryByText('Select Theme')).not.toBeInTheDocument();
  });

  it('closes dropdown when clicking outside', () => {
    const store = createMockStore('dark');
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <Provider store={store}>
          <ThemeSelect />
        </Provider>
      </div>
    );

    const button = screen.getByRole('button', { name: /select theme/i });
    fireEvent.click(button);
    expect(screen.getByText('Select Theme')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('Select Theme')).not.toBeInTheDocument();
  });
});
