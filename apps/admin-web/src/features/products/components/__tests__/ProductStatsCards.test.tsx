import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProductStatsCards } from '../ProductStatsCards';

describe('ProductStatsCards', () => {
  it('renders each stat label and value', () => {
    render(
      <ProductStatsCards
        stats={{
          totalProducts: 1248,
          activeListings: 1102,
          lowStock: 34,
          outOfStock: 12,
        }}
        isLoading={false}
      />,
    );

    expect(screen.getByText('Total Products')).toBeInTheDocument();
    expect(screen.getByText('1248')).toBeInTheDocument();
    expect(screen.getByText('Active Listings')).toBeInTheDocument();
    expect(screen.getByText('1102')).toBeInTheDocument();
    expect(screen.getByText('Low Stock')).toBeInTheDocument();
    expect(screen.getByText('34')).toBeInTheDocument();
    expect(screen.getByText('Out of Stock')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders a loading placeholder for each stat while loading', () => {
    render(<ProductStatsCards stats={undefined} isLoading={true} />);

    expect(screen.getAllByText('—')).toHaveLength(4);
  });
});
