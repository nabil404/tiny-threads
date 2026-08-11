import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from '../form';
import { Input } from '../input';

function TestForm({ defaultError = false }: { defaultError?: boolean }) {
  const form = useForm({
    defaultValues: { username: '' },
    errors: defaultError
      ? ({
          username: { type: 'manual', message: 'Username is required' },
        } as any)
      : undefined,
  });

  React.useEffect(() => {
    if (defaultError) {
      form.setError('username', {
        type: 'manual',
        message: 'Username is required',
      });
    }
  }, [defaultError, form]);

  return (
    <Form {...form}>
      <form>
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="Enter username" {...field} />
              </FormControl>
              <FormDescription>Your unique username.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

describe('Form UI Primitives', () => {
  it('renders label, input, description, and links IDs correctly', () => {
    render(<TestForm />);

    const label = screen.getByText('Username');
    const input = screen.getByPlaceholderText('Enter username');
    const description = screen.getByText('Your unique username.');

    expect(label).toHaveAttribute('for', input.getAttribute('id'));
    expect(input).toHaveAttribute(
      'aria-describedby',
      description.getAttribute('id'),
    );
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('renders error message and updates aria-invalid when field has error', () => {
    render(<TestForm defaultError />);

    const input = screen.getByPlaceholderText('Enter username');
    const errorMessage = screen.getByText('Username is required');

    expect(errorMessage).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(
      errorMessage.getAttribute('id'),
    );
  });
});
