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

    expect(screen.getByRole('heading', { name: /categories/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
