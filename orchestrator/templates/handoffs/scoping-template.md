# Scoping Document Template

> This template ensures scoping documents have all information needed for PRD generation.
> Each section is REQUIRED. Empty sections will cause poor task generation.

---

## PROJECT_NAME
<!-- Single word or hyphenated slug, e.g., "habit-tracker" or "pdf-converter" -->


## ONE_LINER
<!-- Complete this sentence: "A [type of thing] that [does what] for [who]" -->


## PROBLEM
<!-- 2-3 sentences max. What pain point does this solve? -->


## TARGET_USER
<!-- Be specific: "developers who..." not just "developers" -->


## SUCCESS_CRITERIA
<!-- How do we know it's done? List 3-5 measurable outcomes -->
- [ ]
- [ ]
- [ ]

---

## FEATURES

### MUST_HAVE
<!-- Core features. Without these, the project has no value. 3-5 items. -->
| Feature | Description | Acceptance Criteria |
|---------|-------------|---------------------|
| | | |

### SHOULD_HAVE
<!-- Important but not blocking MVP. 2-3 items. -->
| Feature | Description | Acceptance Criteria |
|---------|-------------|---------------------|
| | | |

### OUT_OF_SCOPE
<!-- Explicitly NOT building. Prevents scope creep. -->
-
-

---

## TECHNICAL

### STACK
<!-- Be specific. Not "React" but "Next.js 14 with App Router" -->
| Layer | Technology | Why |
|-------|------------|-----|
| Frontend | | |
| Backend | | |
| Database | | |
| Hosting | | |

### ARCHITECTURE
<!-- One paragraph describing how components connect -->


### EXTERNAL_DEPS
<!-- APIs, services, packages that are critical -->
| Dependency | Purpose | Risk if Unavailable |
|------------|---------|---------------------|
| | | |

---

## RISKS

### TECHNICAL_RISKS
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| | Low/Med/High | Low/Med/High | |

### OPEN_QUESTIONS
<!-- Things we don't know yet that could change the plan -->
- [ ]
- [ ]

---

## COMPLEXITY

**Overall:** [ ] Simple (1-3 tasks) | [ ] Medium (4-7 tasks) | [ ] Complex (8+ tasks)

**Estimated Tasks:** X-Y

**Hardest Part:**
<!-- One sentence about the trickiest implementation challenge -->
