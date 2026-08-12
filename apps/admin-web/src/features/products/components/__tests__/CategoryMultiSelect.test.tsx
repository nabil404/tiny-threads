import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CategoryMultiSelect } from '../CategoryMultiSelect';
import * as categoriesApiModule from '@store/api/endpoints/categoriesApi';

describe('CategoryMultiSelect Component', () => {
  const mockCategories = [
    {
      id: 'cat-1',
      name: 'Clothing',
      parentId: null,
      children: [
        { id: 'cat-2', name: 'Shirts', parentId: 'cat-1' },
      ],
    },
    { id: 'cat-3', name: 'Accessories', parentId: null },
  ];

  it('renders placeholder when no categories are selected', () => {
    vi.spyOn(categoriesApiModule, 'useGetCategoriesQuery').mockReturnValue({
      data: mockCategories,
      isLoading: false,
      refetch: vi.fn(),
    } as any);

    render(<CategoryMultiSelect selectedIds={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Select categories...')).toBeInTheDocument();
  });

  it('renders badge chips for selected category IDs', () => {
    vi.spyOn(categoriesApiModule, 'useGetCategoriesQuery').mockReturnValue({
      data: mockCategories,
      isLoading: false,
      refetch: vi.fn(),
    } as any);

    render(<CategoryMultiSelect selectedIds={['cat-1', 'cat-2']} onChange={vi.fn()} />);
    expect(screen.getByText('Clothing')).toBeInTheDocument();
    expect(screen.getByText('Shirts')).toBeInTheDocument();
  });

  it('calls onChange to remove category when badge remove button is clicked', () => {
    const handleChange = vi.fn();
    vi.spyOn(categoriesApiModule, 'useGetCategoriesQuery').mockReturnValue({
      data: mockCategories,
      isLoading: false,
      refetch: vi.fn(),
    } as any);

    render(<CategoryMultiSelect selectedIds={['cat-1']} onChange={handleChange} />);
    
    // Find the badge button (remove X)
    const removeBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(removeBtn);

    expect(handleChange).toHaveBeenCalledWith([]);
  });
});
