import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthLayout } from '../AuthLayout';

describe('AuthLayout', () => {
  it('renders child outlet content within centered layout container', () => {
    const router = createMemoryRouter(
      [
        {
          element: <AuthLayout />,
          children: [{ path: '/auth/login', element: <div>Sign In Page</div> }],
        },
      ],
      { initialEntries: ['/auth/login'] },
    );

    render(<RouterProvider router={router} />);
    expect(screen.getByText('Sign In Page')).toBeInTheDocument();
  });
});
