# Task Requirements Template

> Requirements must be specific enough that a Worker can implement without asking questions.
> Each requirement should be independently verifiable.

---

## REQUIREMENT FORMAT

Each requirement should follow this pattern:

```
[ACTION] [WHAT] [WHERE] [CONDITION/CONSTRAINT]
```

**ACTION:** Create, Add, Implement, Configure, Update, Remove, Ensure, Validate
**WHAT:** The specific thing (function, component, file, config)
**WHERE:** Location in codebase (file path, module)
**CONDITION:** Success criteria, edge cases, constraints

---

## GOOD vs BAD REQUIREMENTS

### ❌ BAD (Vague)
- "Add authentication"
- "Handle errors properly"
- "Make it responsive"
- "Improve performance"
- "Add tests"

### ✅ GOOD (Specific)
- "Create POST /api/auth/login endpoint that accepts {email, password} and returns JWT token"
- "Wrap API calls in try/catch and show toast notification on 4xx/5xx errors"
- "Add Tailwind breakpoints: mobile (<640px) single column, tablet (640-1024px) 2 columns, desktop (>1024px) 3 columns"
- "Add Redis caching to getUser() with 5-minute TTL"
- "Add Jest tests for calculateTotal() covering: zero items, single item, multiple items, negative quantity (should throw)"

---

## REQUIREMENT CHECKLIST

Before adding a requirement, verify:

- [ ] **Actionable:** Starts with a verb
- [ ] **Specific:** Names exact files, functions, or components
- [ ] **Measurable:** Clear pass/fail criteria
- [ ] **Self-contained:** No external context needed
- [ ] **Testable:** Can be verified with a command or check

---

## TEMPLATE FOR tasks.json REQUIREMENTS

```json
{
  "requirements": [
    "Create [file/component/function] at [path] that [does what]",
    "Implement [feature] with [specific behavior] when [condition]",
    "Add [validation/check] for [input/case] that [expected behavior]",
    "Configure [tool/service] with [specific settings] in [config file]",
    "Ensure [component] handles [edge case] by [specific behavior]"
  ]
}
```

---

## EXAMPLES BY TASK TYPE

### Setup Task
```json
{
  "requirements": [
    "Initialize Next.js 14 project with App Router and TypeScript in outputDir",
    "Install dependencies: tailwindcss, @headlessui/react, lucide-react",
    "Configure Tailwind with zinc color palette as default",
    "Create src/app/layout.tsx with dark mode body class",
    "Add .env.example with required environment variables listed"
  ]
}
```

### API Task
```json
{
  "requirements": [
    "Create POST /api/items endpoint in src/app/api/items/route.ts",
    "Validate request body has required fields: name (string), quantity (number > 0)",
    "Return 400 with {error: string} if validation fails",
    "Return 201 with created item including generated id",
    "Add rate limiting: max 10 requests per minute per IP"
  ]
}
```

### UI Task
```json
{
  "requirements": [
    "Create ItemCard component at src/components/ItemCard.tsx",
    "Accept props: {id: string, name: string, quantity: number, onDelete: () => void}",
    "Display name and quantity with edit button that opens inline edit mode",
    "Delete button shows confirmation before calling onDelete",
    "Add hover state with subtle border color change"
  ]
}
```

### Integration Task
```json
{
  "requirements": [
    "Connect ItemList to /api/items endpoint using SWR for data fetching",
    "Show loading skeleton while fetching (3 placeholder cards)",
    "Display error message with retry button if fetch fails",
    "Optimistically update UI on delete, rollback if API fails",
    "Add pull-to-refresh on mobile using touch events"
  ]
}
```
