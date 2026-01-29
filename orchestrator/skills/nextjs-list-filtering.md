# Filtering Lists with Empty State Handling

## Context
Building components that filter arrays and show empty states.

## Problem
Tests fail when checking filtered content before data loads, or when
empty state renders instead of expected filtered items.

## Solution
1. Always handle empty state explicitly with a distinct message/element
2. Wait for loading to complete before asserting on filtered content
3. Use unique test IDs for empty vs populated states

## Example
```tsx
// Component
const filtered = items.filter(x => x.status === 'complete');

if (filtered.length === 0) {
  return <div data-testid="empty-state">No completed items</div>;
}

return (
  <div data-testid="items-list">
    {filtered.map(item => <Item key={item.id} {...item} />)}
  </div>
);

// Test
await waitFor(() => {
  expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
});
expect(screen.getByTestId('items-list')).toBeInTheDocument();
```

## Key Points
- Filter returns empty array, not undefined - check `.length`
- Parent must pass data before child can filter it
- Async data fetch = component renders empty state first
