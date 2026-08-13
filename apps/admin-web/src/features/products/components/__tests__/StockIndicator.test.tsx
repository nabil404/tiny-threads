import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StockIndicator } from '../StockIndicator';

describe('StockIndicator', () => {
  it('renders the stock count', () => {
    render(<StockIndicator stock={145} lowStockThreshold={10} />);
    expect(screen.getByText('145')).toBeInTheDocument();
  });

  it('labels a zero stock as out of stock', () => {
    render(<StockIndicator stock={0} lowStockThreshold={10} />);
    expect(screen.getByRole('progressbar')).toHaveAccessibleName('Out of stock');
  });

  it('labels stock at or below the threshold as low stock', () => {
    render(<StockIndicator stock={8} lowStockThreshold={10} />);
    expect(screen.getByRole('progressbar')).toHaveAccessibleName('Low stock');
  });

  it('labels stock above the threshold as in stock', () => {
    render(<StockIndicator stock={145} lowStockThreshold={10} />);
    expect(screen.getByRole('progressbar')).toHaveAccessibleName('In stock');
  });

  it('caps the bar fill at 100% once stock reaches 3x the threshold', () => {
    render(<StockIndicator stock={1000} lowStockThreshold={10} />);
    const fill = screen.getByRole('progressbar').firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('fills the bar proportionally below the 3x-threshold cap', () => {
    render(<StockIndicator stock={15} lowStockThreshold={10} />);
    const fill = screen.getByRole('progressbar').firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });
});
