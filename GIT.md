# Git workflow (Turtle)

Use this to keep history readable and avoid leaking secrets.

## Before every commit

```bash
git status
git diff
```

Confirm **`.env`** does not appear (it must stay ignored). Run **`npm test`** when you changed TS/Rust logic.

## Stage and commit

```bash
git add -A
git status
git commit -m "type: short imperative summary"
```

**Message style:** `feat`, `fix`, `docs`, `chore`, `test`, `refactor` — present tense, ~72 chars subject, optional body after a blank line.

**Example:**

```bash
git commit -m "feat(stdb): add task timeouts and command rate limits"
```

## Push

```bash
git pull --rebase origin master
git push origin master
```

Use your real branch name if not `master`.

## Optional: one logical commit per topic

```bash
git add module/spacetimedb/
git commit -m "feat(stdb): timeouts, rate limits, reducer validation"

git add mobile/src/
git commit -m "feat(mobile): Gemini resilience, synthesis, reconnect helper"

git add server/ package.json package-lock.json
git commit -m "feat(server): planner HTTP /plan and /synthesize"

git add frontend/
git commit -m "feat(frontend): ErrorBoundary and planner dispatch"

git add README.md .gitignore GIT.md .env.example
git commit -m "docs: README, git workflow, env template"
```

## Never commit

- **`.env`** and other env files with real keys (see **`.gitignore`**)
- **`node_modules/`**, **`**/target/`**, **`coverage/`**, build folders
- **`spacetime.local.json`**

## Useful commands

```bash
git check-ignore -v .env          # why a path is ignored
git log --oneline -15             # recent history
git restore --staged <file>       # unstage
```
