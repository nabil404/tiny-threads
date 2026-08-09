import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LocaleSelect } from '../locale-select';
import { LOCALES, LOCALE_STORAGE_KEY } from '@i18n/locales';

describe('LocaleSelect (Standalone Component - No Redux dependency)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders active locale button when controlled via value prop', () => {
    render(<LocaleSelect value="en" />);

    const button = screen.getByRole('button', { name: /select language/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('English');
  });

  it('opens dropdown menu when clicked', () => {
    render(<LocaleSelect value="en" />);

    const button = screen.getByRole('button', { name: /select language/i });
    fireEvent.click(button);

    expect(screen.getByText('Select Language')).toBeInTheDocument();
    LOCALES.forEach((locale) => {
      expect(screen.getAllByText(locale.nativeName).length).toBeGreaterThan(0);
    });
  });

  it('calls onChange callback when an option is clicked in controlled mode', () => {
    const handleChange = vi.fn();
    render(<LocaleSelect value="en" onChange={handleChange} />);

    const button = screen.getByRole('button', { name: /select language/i });
    fireEvent.click(button);

    const option = screen.getByRole('button', { name: /english/i });
    fireEvent.click(option);

    expect(handleChange).toHaveBeenCalledWith('en');
    expect(screen.queryByText('Select Language')).not.toBeInTheDocument();
  });

  it('updates localStorage when clicked in uncontrolled mode without Redux', () => {
    render(<LocaleSelect />);

    const button = screen.getByRole('button', { name: /select language/i });
    fireEvent.click(button);

    const option = screen.getByRole('button', { name: /english/i });
    fireEvent.click(option);

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });
});
