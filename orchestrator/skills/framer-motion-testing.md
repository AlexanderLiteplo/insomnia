# Testing Framer Motion Components

## Context
Testing React components that use Framer Motion animations.

## Problem
Tests fail because animated elements haven't rendered when assertions run.
Staggered animations (staggerChildren) delay child elements further.

## Solution
1. Use `waitFor()` with timeouts longer than animation duration
2. Account for stagger delays: `staggerChildren * numItems + itemDuration`
3. Test the final visible state, not intermediate states

## Example
```tsx
// Component with staggerChildren: 0.15, itemDuration: 0.4
// For 3 items: 0.15 * 3 + 0.4 = 0.85s minimum wait

await waitFor(() => {
  expect(screen.getByText('Item 3')).toBeVisible();
}, { timeout: 2000 }); // Add buffer for safety
```

## Key Patterns
- `initial="hidden"` + `animate="visible"` = elements start invisible
- Check for `opacity: 0` or `transform` in hidden variants
- Framer Motion uses `data-framer-*` attributes you can query
