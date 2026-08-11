import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeSelect } from '../theme-select';
import { THEMES, THEME_STORAGE_KEY } from '@theme/themes';

describe('ThemeSelect (Standalone Component - No Redux dependency)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders active theme button when controlled via value prop', () => {
    render(<ThemeSelect value="light" />);

    const button = screen.getByRole('button', { name: /select theme/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Light');
  });

  it('opens dropdown menu when clicked', () => {
    render(<ThemeSelect value="dark" />);

    const button = screen.getByRole('button', { name: /select theme/i });
    fireEvent.click(button);

    expect(screen.getByText('Select Theme')).toBeInTheDocument();
    THEMES.forEach((theme) => {
      expect(screen.getAllByText(theme.name).length).toBeGreaterThan(0);
      expect(screen.getByText(theme.description)).toBeInTheDocument();
    });
  });

  it('calls onChange callback when an option is clicked in controlled mode', () => {
    const handleChange = vi.fn();
    render(<ThemeSelect value="dark" onChange={handleChange} />);

    const button = screen.getByRole('button', { name: /select theme/i });
    fireEvent.click(button);

    const lightOption = screen.getByRole('button', { name: /light/i });
    fireEvent.click(lightOption);

    expect(handleChange).toHaveBeenCalledWith('light');
    expect(screen.queryByText('Select Theme')).not.toBeInTheDocument();
  });

  it('updates local state and DOM when clicked in uncontrolled mode without Redux', () => {
    render(<ThemeSelect />);

    const button = screen.getByRole('button', { name: /select theme/i });
    fireEvent.click(button);

    const lightOption = screen.getByRole('button', { name: /light/i });
    fireEvent.click(lightOption);

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('closes dropdown when clicking outside', () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <ThemeSelect value="dark" />
      </div>,
    );

    const button = screen.getByRole('button', { name: /select theme/i });
    fireEvent.click(button);
    expect(screen.getByText('Select Theme')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('Select Theme')).not.toBeInTheDocument();
  });
});
