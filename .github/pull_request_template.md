# Pull Request Template

> Copy this into your repository as `.github/pull_request_template.md` so it auto-populates on every PR.

---

## Closes

Closes #[issue_number]

## What Changed

*Brief description of what this PR implements. 2-3 sentences max.*

## How to Test

*Step-by-step instructions for the proposer to verify this PR works:*

1. Pull this branch and run `npm run dev` (or equivalent)
2. Navigate to [specific page/route]
3. [Specific action to take]
4. Expected result: [what should happen]

## Screenshot

*If this PR includes UI changes, attach a screenshot or screen recording.*

## AI Tools Used

*Which AI tools did you use for this PR? What did they generate? What did you write or modify yourself?*

| Tool | What it did | What you changed |
|------|------------|-----------------|
| | | |

## Self-Review Checklist

Before requesting review, confirm:

- [ ] No secrets (API keys, passwords) in this PR
- [ ] Error handling present for all new API calls or database operations
- [ ] Input validation on any new form fields or API parameters
- [ ] Loading and error states present for any new data-fetching UI
- [ ] Tests pass locally (`npm test` or `pytest`)
- [ ] PR is focused and <400 lines (if larger, consider splitting)
- [ ] Commit messages are descriptive (not "fix" or "update")
