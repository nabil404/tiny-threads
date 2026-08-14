import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../useUnsavedChangesWarning';
import { UnsavedChangesDialog } from '@components/ui/unsaved-changes-dialog';

function TestFormComponent({
  isDirty,
  isSubmitting,
}: {
  isDirty: boolean;
  isSubmitting?: boolean;
}) {
  const { isBlocked, proceed, reset } = useUnsavedChangesWarning({
    isDirty,
    isSubmitting,
  });

  return (
    <div>
      <h1>Form Page</h1>
      <Link to="/other">Go to Other</Link>
      <UnsavedChangesDialog
        open={isBlocked}
        onConfirm={proceed}
        onCancel={reset}
      />
    </div>
  );
}

function OtherPageComponent() {
  return <h1>Other Page</h1>;
}

describe('useUnsavedChangesWarning', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  describe('beforeunload event', () => {
    it('registers beforeunload listener when isDirty is true', () => {
      const router = createMemoryRouter([
        {
          path: '/',
          element: <TestFormComponent isDirty={true} />,
        },
      ]);

      const { unmount } = render(<RouterProvider router={router} />);

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function),
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function),
      );
    });

    it('does not register beforeunload listener when isDirty is false', () => {
      const router = createMemoryRouter([
        {
          path: '/',
          element: <TestFormComponent isDirty={false} />,
        },
      ]);

      render(<RouterProvider router={router} />);

      expect(addEventListenerSpy).not.toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function),
      );
    });

    it('does not register beforeunload listener when isSubmitting is true even if isDirty is true', () => {
      const router = createMemoryRouter([
        {
          path: '/',
          element: <TestFormComponent isDirty={true} isSubmitting={true} />,
        },
      ]);

      render(<RouterProvider router={router} />);

      expect(addEventListenerSpy).not.toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function),
      );
    });

    it('triggers preventDefault and sets returnValue on beforeunload event', () => {
      let beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
      addEventListenerSpy.mockImplementation(
        (event: string, handler: EventListenerOrEventListenerObject) => {
          if (event === 'beforeunload') {
            beforeUnloadHandler = handler as (e: BeforeUnloadEvent) => void;
          }
        },
      );

      const router = createMemoryRouter([
        {
          path: '/',
          element: <TestFormComponent isDirty={true} />,
        },
      ]);

      render(<RouterProvider router={router} />);

      expect(beforeUnloadHandler).toBeDefined();

      const mockEvent = {
        preventDefault: vi.fn(),
        returnValue: undefined,
      } as unknown as BeforeUnloadEvent;

      beforeUnloadHandler!(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.returnValue).toBe('');
    });
  });

  describe('route navigation blocking', () => {
    it('blocks navigation and shows dialog when isDirty is true', async () => {
      const user = userEvent.setup();
      const router = createMemoryRouter(
        [
          { path: '/', element: <TestFormComponent isDirty={true} /> },
          { path: '/other', element: <OtherPageComponent /> },
        ],
        { initialEntries: ['/'] },
      );

      render(<RouterProvider router={router} />);

      await user.click(screen.getByRole('link', { name: 'Go to Other' }));

      // Blocked modal should be visible
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Unsaved Changes' }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/');
    });

    it('stays on page when clicking Stay on Page (cancel/reset)', async () => {
      const user = userEvent.setup();
      const router = createMemoryRouter(
        [
          { path: '/', element: <TestFormComponent isDirty={true} /> },
          { path: '/other', element: <OtherPageComponent /> },
        ],
        { initialEntries: ['/'] },
      );

      render(<RouterProvider router={router} />);

      await user.click(screen.getByRole('link', { name: 'Go to Other' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Stay on Page' }));

      // Dialog closed and user still on the form page
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/');
    });

    it('proceeds with navigation when clicking Leave Page (confirm)', async () => {
      const user = userEvent.setup();
      const router = createMemoryRouter(
        [
          { path: '/', element: <TestFormComponent isDirty={true} /> },
          { path: '/other', element: <OtherPageComponent /> },
        ],
        { initialEntries: ['/'] },
      );

      render(<RouterProvider router={router} />);

      await user.click(screen.getByRole('link', { name: 'Go to Other' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Leave Page' }));

      // Navigation proceeds to target page
      expect(screen.getByRole('heading', { name: 'Other Page' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/other');
    });

    it('allows immediate navigation without dialog when isDirty is false', async () => {
      const user = userEvent.setup();
      const router = createMemoryRouter(
        [
          { path: '/', element: <TestFormComponent isDirty={false} /> },
          { path: '/other', element: <OtherPageComponent /> },
        ],
        { initialEntries: ['/'] },
      );

      render(<RouterProvider router={router} />);

      await user.click(screen.getByRole('link', { name: 'Go to Other' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Other Page' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/other');
    });
  });
});
