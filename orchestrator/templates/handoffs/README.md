# Handoff Templates

Structured formats for Claude-to-Claude communication in the orchestrator system.

## Why Structured Handoffs?

When one Claude instance passes work to another, ambiguity causes problems:
- Vague scoping docs → vague tasks
- Unclear manager feedback → worker doesn't know what to fix
- Unstructured worker notes → manager can't review efficiently

These templates enforce consistent, parseable formats at each handoff point.

## Templates

| Template | Used By | Purpose |
|----------|---------|---------|
| `scoping-template.md` | `scope.sh` | Project idea → structured scope doc |
| `task-requirements.md` | `generate-prd.sh` | How to write actionable requirements |
| `manager-feedback.md` | `manager.sh` | Structured feedback when sending work back |
| `worker-notes.md` | `worker.sh` | How to document completed work |

## Flow Diagram

```
┌─────────────────┐
│  Project Idea   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     Uses: scoping-template.md
│    scope.sh     │────────────────────────────────┐
│   (Manager)     │                                │
└────────┬────────┘                                ▼
         │                              ┌──────────────────┐
         │                              │  Scoping Doc     │
         ▼                              │  (structured)    │
┌─────────────────┐                     └──────────────────┘
│ generate-prd.sh │     Uses: task-requirements.md
│   (Manager)     │────────────────────────────────┐
└────────┬────────┘                                │
         │                                         ▼
         │                              ┌──────────────────┐
         ▼                              │   tasks.json     │
┌─────────────────┐                     │  (actionable)    │
│   worker.sh     │                     └──────────────────┘
│   (Worker)      │     Uses: worker-notes.md
└────────┬────────┘────────────────────────────────┐
         │                                         │
         │                                         ▼
         ▼                              ┌──────────────────┐
┌─────────────────┐                     │  workerNotes     │
│   manager.sh    │                     │  (structured)    │
│   (Manager)     │                     └──────────────────┘
└────────┬────────┘     Uses: manager-feedback.md
         │ ────────────────────────────────────────┐
         │                                         │
         ▼                                         ▼
┌─────────────────┐                     ┌──────────────────┐
│  If REVISE:     │                     │  managerReview   │
│  Back to Worker │                     │  (structured)    │
└─────────────────┘                     └──────────────────┘
```

## Format Examples

### Manager Feedback (managerReview field)
```
VERDICT: REVISE
ISSUE: Unit test for calculateTotal() fails with negative numbers
LOCATION: src/utils/calculator.ts:45
FIX: Add validation: if (quantity < 0) throw new InvalidQuantityError()
TEST: npm test -- --grep "negative numbers"
```

### Worker Notes (workerNotes field)
```
STATUS: DONE
IMPLEMENTED: src/api/items/route.ts, src/lib/validators.ts
TESTS: 3/3 passing, exit code 0
DECISIONS: Used Zod for validation (better error messages)
ISSUES: None
```

## Adding New Templates

1. Create `your-template.md` in this directory
2. Update the relevant script to load/use the template
3. Document the format and examples
4. Update this README

## Parsing Templates

The structured formats use `|` as field separators for easy parsing:

```bash
# Extract VERDICT from managerReview
echo "$review" | grep -oP 'VERDICT: \K\w+'

# Extract STATUS from workerNotes
echo "$notes" | grep -oP 'STATUS: \K\w+'
```
