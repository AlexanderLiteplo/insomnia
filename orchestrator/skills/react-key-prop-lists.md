# Unique Keys for Dynamic Lists

## Context
Rendering lists in React where items may have duplicate names.

## Problem
Using only `item.name` as key causes React reconciliation bugs when
items share names. Tests may find wrong elements or see stale renders.

## Solution
Combine multiple fields or include index for uniqueness:
- `key={item.id}` if unique ID exists
- `key={\`${item.name}-${index}\`}` as fallback
- Never use index alone if list reorders

## Example
```tsx
// Bad - names can duplicate
{projects.map(p => <Card key={p.name} {...p} />)}

// Good - guaranteed unique
{projects.map((p, i) => <Card key={`${p.name}-${i}`} {...p} />)}

// Best - if ID exists
{projects.map(p => <Card key={p.id} {...p} />)}
```

## Test Implications
- Duplicate keys cause "two children with same key" warning
- Wrong key = wrong component receives props on re-render
- Use `getAllByTestId` and check length for list assertions
