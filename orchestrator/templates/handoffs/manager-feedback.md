# Manager Feedback Template

> When sending a task back to the Worker for fixes, use this EXACT format.
> The Worker parses these fields to understand what to do.

---

## FEEDBACK FORMAT

```
VERDICT: APPROVE | REVISE | BLOCKED

ISSUE: <one sentence describing what's wrong>

LOCATION: <file path and line number or function name>

EXPECTED: <what should happen>

ACTUAL: <what's happening instead>

FIX: <specific action to take, not vague guidance>

TEST: <exact command to verify the fix works>

CONTEXT: <any additional info the worker needs, optional>
```

---

## EXAMPLES

### Example 1: Test Failure
```
VERDICT: REVISE

ISSUE: Unit test for calculateTotal() fails with negative numbers

LOCATION: src/utils/calculator.ts:45, tests/calculator.test.ts:23

EXPECTED: Negative quantities should throw InvalidQuantityError

ACTUAL: Function returns NaN without error

FIX: Add validation at line 45: if (quantity < 0) throw new InvalidQuantityError()

TEST: npm test -- --grep "negative numbers"

CONTEXT: The InvalidQuantityError class already exists in src/errors.ts
```

### Example 2: Missing Feature
```
VERDICT: REVISE

ISSUE: Delete button exists but doesn't show confirmation dialog

LOCATION: src/components/ItemRow.tsx:78

EXPECTED: Clicking delete shows "Are you sure?" modal before deleting

ACTUAL: Item deletes immediately on click

FIX: Wrap deleteItem() call in confirmDialog() from src/utils/dialogs.ts

TEST: npm run test:e2e -- --spec delete-confirmation

CONTEXT: See TaskRow.tsx:92 for example of confirmation pattern
```

### Example 3: Approval
```
VERDICT: APPROVE

ISSUE: None - all requirements met

LOCATION: N/A

EXPECTED: N/A

ACTUAL: N/A

FIX: N/A

TEST: All tests passing (npm test exit code 0)

CONTEXT: Good implementation. Added skill note about the caching pattern used.
```

### Example 4: Blocked
```
VERDICT: BLOCKED

ISSUE: Cannot proceed - missing API credentials

LOCATION: N/A

EXPECTED: STRIPE_SECRET_KEY in environment

ACTUAL: Environment variable not set, cannot test payment flow

FIX: Human action required - add Stripe API key to .env

TEST: N/A until credentials provided

CONTEXT: Created human task for credential setup. Marking blocked.
```

---

## RULES

1. **VERDICT is required** - Always start with APPROVE, REVISE, or BLOCKED
2. **Be specific** - "Fix the bug" is useless. "Add null check at line 45" is useful.
3. **One issue per feedback** - If multiple issues, send back for the most critical one first
4. **Include test command** - Worker needs to verify their fix works
5. **Reference existing code** - Point to examples in the codebase when possible
6. **No opinions** - Facts only. "This could be cleaner" is not actionable.
