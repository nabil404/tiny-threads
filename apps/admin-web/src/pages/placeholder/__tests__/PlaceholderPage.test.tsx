import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlaceholderPage } from '../PlaceholderPage';

describe('PlaceholderPage', () => {
  it('renders title, description, and link back to dashboard', () => {
    render(
      <MemoryRouter>
        <PlaceholderPage title="Categories" />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: /categories/i, level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to dashboard/i }),
    ).toHaveAttribute('href', '/');
  });

  it('renders translated title when titleKey is provided', () => {
    render(
      <MemoryRouter>
        <PlaceholderPage titleKey="nav.customers" title="Customers" />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: /customers/i, level: 1 }),
    ).toBeInTheDocument();
  });

  it('renders custom description when provided', () => {
    const customDesc = 'Custom placeholder section description.';
    render(
      <MemoryRouter>
        <PlaceholderPage title="Analytics" description={customDesc} />
      </MemoryRouter>,
    );

    expect(screen.getAllByText(customDesc).length).toBeGreaterThan(0);
  });
});
