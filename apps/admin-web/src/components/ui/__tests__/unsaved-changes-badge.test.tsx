import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnsavedChangesBadge } from '../unsaved-changes-badge';

describe('UnsavedChangesBadge', () => {
  it('renders badge when isDirty is true', () => {
    render(<UnsavedChangesBadge isDirty={true} />);

    const badge = screen.getByRole('status');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Unsaved changes');
  });

  it('renders nothing when isDirty is false', () => {
    const { container } = render(<UnsavedChangesBadge isDirty={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('applies custom className when provided', () => {
    render(<UnsavedChangesBadge isDirty={true} className="custom-class" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveClass('custom-class');
  });
});
