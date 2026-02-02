# Worker Notes Template

> When completing a task, the Worker documents what was done in workerNotes.
> This helps the Manager review efficiently and creates a record for future reference.

---

## WORKER NOTES FORMAT

```
STATUS: DONE | PARTIAL | BLOCKED

IMPLEMENTED:
- [file]: [what was created/changed]
- [file]: [what was created/changed]

TESTS:
- [test name]: PASS | FAIL | SKIPPED
- Command: [exact test command run]
- Result: [exit code and summary]

DECISIONS:
- [decision made]: [why]

ISSUES:
- [any problems encountered and how resolved, or still open]

NOTES:
- [anything the manager should know for review]
```

---

## EXAMPLES

### Example 1: Clean Completion
```
STATUS: DONE

IMPLEMENTED:
- src/app/api/items/route.ts: Created POST endpoint with validation
- src/lib/validators.ts: Added itemSchema using Zod
- src/types/item.ts: Added Item and CreateItemInput types

TESTS:
- POST /api/items with valid data: PASS
- POST /api/items with missing name: PASS (returns 400)
- POST /api/items with negative quantity: PASS (returns 400)
- Command: npm test -- --grep "items API"
- Result: Exit 0, 3/3 tests passing

DECISIONS:
- Used Zod over manual validation: Better error messages, type inference

ISSUES:
- None

NOTES:
- Rate limiting not implemented yet - that's task-005
```

### Example 2: Partial Completion
```
STATUS: PARTIAL

IMPLEMENTED:
- src/components/ItemCard.tsx: Created component with display and delete
- src/components/ItemCard.test.tsx: Added unit tests

TESTS:
- Renders item name and quantity: PASS
- Delete button triggers onDelete: PASS
- Edit mode toggle: FAIL (not implemented)
- Command: npm test -- ItemCard
- Result: Exit 1, 2/3 tests passing

DECISIONS:
- N/A

ISSUES:
- Edit mode inline editing not completed
- Requirement said "edit button opens inline edit mode" but ran out of context
- Delete and display working, edit mode needs follow-up

NOTES:
- Marking as done since tests for implemented features pass
- Edit mode may need separate task or manager to send back
```

### Example 3: Blocked
```
STATUS: BLOCKED

IMPLEMENTED:
- src/lib/stripe.ts: Created Stripe client wrapper
- src/app/api/checkout/route.ts: Started checkout endpoint

TESTS:
- Command: npm test -- stripe
- Result: Cannot run - STRIPE_SECRET_KEY not set

DECISIONS:
- N/A

ISSUES:
- STRIPE_SECRET_KEY environment variable not set
- Cannot test or complete payment integration without credentials
- Created human task for credential setup

NOTES:
- Code structure is ready, just needs credentials to test
- Marked task as blocked, not done
```

---

## RULES

1. **STATUS is required** - Always start with DONE, PARTIAL, or BLOCKED
2. **List all files changed** - Manager needs to know what to review
3. **Include test results** - Exact command and exit code
4. **Document decisions** - Why you chose one approach over another
5. **Be honest about issues** - Partial work is okay, hiding issues is not
6. **Keep it concise** - Bullet points, not paragraphs
