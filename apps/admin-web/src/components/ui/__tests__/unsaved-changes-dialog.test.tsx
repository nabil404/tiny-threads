import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnsavedChangesDialog } from '../unsaved-changes-dialog';

describe('UnsavedChangesDialog', () => {
  it('renders default unsaved changes title, description, and action buttons', () => {
    render(
      <UnsavedChangesDialog
        open={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Unsaved Changes' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'You have unsaved changes on this page. If you leave now, your changes will be lost.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Leave Page' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Stay on Page' }),
    ).toBeInTheDocument();
  });

  it('calls onConfirm when clicking Leave Page', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <UnsavedChangesDialog
        open={true}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Leave Page' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when clicking Stay on Page', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <UnsavedChangesDialog
        open={true}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Stay on Page' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
