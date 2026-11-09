# Agent context

Read `README.md` and `docs/PROJECT_OVERVIEW.md` before substantial changes. `docs/PRODUCT_REQUIREMENTS.md` and `docs/BUILD_CHECKLIST.md` preserve the original plan and can contain old defaults or repository layout; check current code and tests before relying on a checked item.

The frontend is in `blind675/world-sim-3-client`. Keep API changes compatible with that client and update both repositories when a change requires it.

## Branch and release policy

`staging` is the integration branch for ordinary work in all three repositories (server, web client, mobile). Before editing, fetch and switch to `staging`; commit and push fixes, features, and documentation there. Do not commit or push routine work to `main`, even if the local checkout starts on `main`. Keep GitHub's default branch as `main` for now.

`main` is the production release branch. Merge or push to `main` only when the user explicitly requests a release to `main`, after reviewing the staging diff and running the relevant checks. A staging push is not a release. Follow [docs/RELEASE_WORKFLOW.md](docs/RELEASE_WORKFLOW.md) for the cross-repository release order and deployment-cost notes. Tell the user which branch received each change.
