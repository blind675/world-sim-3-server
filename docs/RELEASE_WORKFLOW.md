# Staging and production release workflow

All routine work goes to the `staging` branch of the repository it changes. `main` is a production release branch and changes only after the user explicitly requests a release to `main`. GitHub's default branch remains `main` for now. This rule applies to the backend, web client, and mobile app, including documentation-only changes.

## Agent workflow

Before editing, read that repository's `AGENTS.md`, inspect the worktree, fetch `origin`, and switch to `staging`. Preserve any existing local changes rather than resetting them. Make ordinary commits on `staging` and push `origin staging`; report the branch and commit to the user. Do not merge or push `main` merely because checks passed, a task is complete, or an older instruction says to push all work to `main`.

Some cloud checkouts fetch only `main` by default. If `origin/staging` is missing despite the branch existing on GitHub, add `+refs/heads/staging:refs/remotes/origin/staging` to `remote.origin.fetch`, fetch again, and then switch to or create the local `staging` branch tracking `origin/staging`.

For cross-repository work, update the matching `staging` branches and keep API changes compatible across the server, web, and mobile viewers. Staging commits are development work, not deployed releases.

## Explicit release

Only an explicit request such as “release the web client to main” authorizes a production release. For each named repository:

1. Fetch and compare `origin/main` with `origin/staging`; review the exact diff and confirm which changes will ship. If `main` advanced independently, bring it into `staging`, resolve conflicts, and rerun affected checks. Never force-push either branch.
2. Run relevant release checks: backend `npm test`; web `npm run lint` and `npm run build`; mobile `npm run typecheck` and `npx expo export --platform ios --platform android`. Check any required environment or API compatibility before releasing a dependent viewer.
3. Merge `staging` into `main` through a reviewed GitHub pull request when branch rules require it. If direct fast-forward releases are intentionally allowed, fast-forward only the named repository's `main` after the same review and checks. Do not create a release commit or push `main` for another repository unless requested.
4. Verify the corresponding deployment or build result. When a PR merge creates a merge commit on `main`, bring that commit back into `staging` so subsequent release diffs stay clear.

For a coordinated backend and viewer release, deploy and verify the backend first, then the web viewer, then mobile if requested. This order matters when viewers depend on new API fields.

## Hosting triggers and cost

- The mobile EAS TestFlight workflow is configured for pushes to `main` (excluding Markdown-only changes). Staging pushes should not create TestFlight builds.
- Netlify's production branch should remain `main`. Disable branch deploys and Deploy Previews for `staging` in Netlify settings if their builds incur unwanted cost. A staging push is only cheap if Netlify is not configured to build that branch.
- Railway's production service should remain connected to the backend `main` branch. Check for staging or PR preview environments before assuming a backend staging push has no hosting cost.

## Enforcement and discoverability

`AGENTS.md` on `staging` gives AI coding agents the workflow when they work there. Because GitHub's default branch is still `main`, a newly connected agent may initially read the older `main` instructions until the next authorized release carries this policy into `main`. Repository-level GitHub rulesets or branch protection for `main` are the actual safeguard against accidental pushes: require a pull request to update `main`, limit bypass rights, and make the release owner the reviewer. Do not rely on an instruction file alone to enforce a protected branch.

Set that safeguard in each repository's GitHub **Settings → Rules → Rulesets** (or **Branches → Branch protection**): target `main`, require a pull request before merging, block force pushes and deletion, and keep bypass access limited to the release owner. Review the repository's available ruleset options before saving. This is a GitHub setting, not a tracked file; agents cannot enforce it by editing `AGENTS.md`.
