import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { toast } from 'sonner';
import { Toaster } from '../sonner';

describe('Toaster component', () => {
  beforeEach(() => {
    // Clear any active toasts
    toast.dismiss();
  });

  it('renders without crashing with default light theme', () => {
    const { container } = render(<Toaster />);
    expect(container).toBeDefined();
  });

  it('renders toast content when toast is triggered', async () => {
    render(<Toaster />);

    act(() => {
      toast.success('Test success message');
    });

    expect(await screen.findByText('Test success message')).toBeInTheDocument();
  });

  it('renders with dark theme prop and displays error toast', async () => {
    render(<Toaster theme="dark" />);

    act(() => {
      toast.error('Test error message');
    });

    expect(await screen.findByText('Test error message')).toBeInTheDocument();
  });
});
