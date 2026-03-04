export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

export type SortValue = string | number | boolean | Date | null | undefined;

const normalizeValue = (value: SortValue) => {
  if (value === null || value === undefined) {
    return { type: 'empty', value: null };
  }
  if (value instanceof Date) {
    return { type: 'number', value: value.getTime() };
  }
  if (typeof value === 'boolean') {
    return { type: 'number', value: value ? 1 : 0 };
  }
  if (typeof value === 'number') {
    return { type: 'number', value };
  }
  const trimmed = value.toString().trim();
  return { type: 'string', value: trimmed.toLowerCase() };
};

export const compareSortValues = (a: SortValue, b: SortValue): number => {
  const left = normalizeValue(a);
  const right = normalizeValue(b);

  if (left.type === 'empty' && right.type === 'empty') return 0;
  if (left.type === 'empty') return 1;
  if (right.type === 'empty') return -1;

  if (left.type === 'number' && right.type === 'number') {
    return (left.value as number) - (right.value as number);
  }

  return (left.value as string).localeCompare(right.value as string);
};

export const getNextSortState = (current: SortState | null, key: string): SortState => {
  if (!current || current.key !== key) {
    return { key, direction: 'asc' };
  }
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
};

export const sortByState = <T>(
  items: T[],
  sortState: SortState | null,
  valueGetter: (item: T, key: string) => SortValue
): T[] => {
  if (!sortState) return items;
  const { key, direction } = sortState;
  const multiplier = direction === 'asc' ? 1 : -1;
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const cmp = compareSortValues(valueGetter(a.item, key), valueGetter(b.item, key));
      if (cmp !== 0) return cmp * multiplier;
      return a.index - b.index;
    })
    .map(entry => entry.item);
};

export const formatSortIndicator = (sortState: SortState | null, key: string): string => {
  if (!sortState || sortState.key !== key) return '';
  return sortState.direction === 'asc' ? '^' : 'v';
};
