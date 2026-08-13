import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Badge } from '@components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@components/ui/command';
import {
  useGetCategoriesQuery,
  type CategoryTreeNode,
} from '@store/api/endpoints/categoriesApi';
import { cn } from '@/lib/utils';

export interface CategoryMultiSelectProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

/** Flatten a category tree into a flat list with depth-indented labels */
function flattenTree(
  nodes: CategoryTreeNode[],
  depth = 0,
): Array<{ id: string; name: string; depth: number }> {
  const result: Array<{ id: string; name: string; depth: number }> = [];
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, depth });
    if (node.children && node.children.length > 0) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

export function CategoryMultiSelect({
  selectedIds,
  onChange,
}: CategoryMultiSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: categoryTree = [], isLoading } = useGetCategoriesQuery();

  const flatCategories = useMemo(
    () => flattenTree(categoryTree),
    [categoryTree],
  );

  const selectedNames = useMemo(() => {
    const nameMap = new Map(flatCategories.map((c) => [c.id, c.name]));
    return selectedIds.map((id) => ({ id, name: nameMap.get(id) ?? id }));
  }, [selectedIds, flatCategories]);

  const toggleCategory = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const removeCategory = (id: string) => {
    onChange(selectedIds.filter((sid) => sid !== id));
  };

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            role="combobox"
            aria-expanded={open}
            className="flex h-auto min-h-11 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs cursor-pointer focus-within:ring-2 focus-within:ring-ring/20 focus-within:border-primary"
          >
            <div className="flex flex-wrap gap-1 flex-1">
              {selectedNames.length > 0 ? (
                selectedNames.map(({ id, name }) => (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {name}
                    <span
                      role="button"
                      tabIndex={0}
                      className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5 cursor-pointer inline-flex items-center justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCategory(id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          removeCategory(id);
                        }
                      }}
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground text-sm">
                  {t('products.selectCategories')}
                </span>
              )}
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder={t('products.searchCategories')} />
            <CommandList>
              <CommandEmpty>
                {isLoading ? t('products.categoriesLoading') : t('products.categoriesEmpty')}
              </CommandEmpty>
              <CommandGroup>
                {flatCategories.map((cat) => (
                  <CommandItem
                    key={cat.id}
                    value={cat.name}
                    onSelect={() => toggleCategory(cat.id)}
                    className="cursor-pointer"
                  >
                    <div
                      style={{ paddingLeft: `${cat.depth * 16}px` }}
                      className="flex items-center gap-2 w-full"
                    >
                      <div
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded border border-primary',
                          selectedIds.includes(cat.id)
                            ? 'bg-primary text-primary-foreground'
                            : 'opacity-50',
                        )}
                      >
                        {selectedIds.includes(cat.id) && (
                          <Check className="h-3 w-3" />
                        )}
                      </div>
                      <span>{cat.name}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
