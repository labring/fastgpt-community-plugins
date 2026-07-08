# Scheduled PR review and merge

You are running as an unattended scheduled Codex task for this repository.

## Objective

Every run must scan all open GitHub pull requests for the current repository, review each PR with the repository skill at `.agents/skills/plugin-review/SKILL.md`, post review evidence to the PR, and squash-merge only PRs that satisfy every merge gate below.

## Required setup

1. Read `.agents/skills/plugin-review/SKILL.md` completely before reviewing any PR.
2. Follow the skill's required context and output contract.
3. Read the repository context required by that skill, including:
   - `schemas/registry.ts`
   - `schemas/review.ts`
   - `schemas/event.ts`
   - `plugins.json`
   - the candidate plugin submodule path for each PR
4. Use `gh` for GitHub PR discovery, comments, status checks, and merges.

## PR discovery

List all open PRs for the current GitHub repository. Include draft PRs in the review scan, but never merge drafts.

Recommended command:

```bash
gh pr list --state open --json number,title,url,isDraft,headRefName,baseRefName,headRefOid,mergeable,reviewDecision,statusCheckRollup,labels,author
```

If there are no open PRs, report that clearly and exit successfully.

## Review loop

For each open PR, perform up to three review rounds:

1. Deterministic evidence round: validate registry/submodule/source metadata and run available deterministic gates such as `pnpm run validate`, package build/check/pack commands, policy scan, and checksum verification when applicable.
2. Risk round: inspect security, license, dependency, network, filesystem, process execution, source ownership, and maintenance risk.
3. Merge-readiness round: verify GitHub status checks, mergeability, review decision, labels, draft state, blocking comments, and whether any simple repository metadata conflicts can be safely fixed by the automation.

Post at most one top-level PR comment per PR per scheduled run. Use the `plugin-review` output contract and add a short "Scheduled Merge Gate" section that states whether the PR was merged, blocked, or left pending.

## Simple conflict remediation

If the only issue blocking merge is a simple conflict in repository metadata, fix it directly and push the fix to the PR branch when GitHub permits maintainer edits.

Eligible files are limited to:

- `plugins.json`
- `.gitmodules`
- submodule gitlink entries under `packages/tools/<pluginId>`
- generated registry metadata that is directly derived from those files

Only perform this remediation when all conditions below are true:

- The `plugin-review` verdict is otherwise `pass`.
- The conflict is mechanical and low-risk, such as preserving both independent `plugins.json` entries, reconciling `.gitmodules` entries, or updating the plugin submodule gitlink to the reviewed source commit.
- The PR branch is writable by maintainers without force-push.
- The fix does not modify plugin implementation code, package code, dependency manifests inside the plugin, lockfiles inside the plugin, policy-relevant behavior, source ownership, or license content.
- The fix can be validated locally with the same deterministic gates required by `plugin-review`.

Recommended remediation flow:

1. Check out the PR branch in a clean worktree or temporary checkout.
2. Apply the minimal metadata-only conflict fix.
3. Run deterministic validation again.
4. Commit the fix with a clear message such as `fix: resolve registry metadata conflict`.
5. Push normally to the PR branch. Never force-push.
6. Post a PR comment explaining which metadata conflict was fixed, which validation was rerun, and that the contributor does not need to make that mechanical change.
7. Refresh the PR head SHA and continue merge evaluation using the new SHA.

If the conflict is outside the eligible files, is not obviously mechanical, cannot be validated, or the branch is not writable, leave a comment explaining the blocker and ask the contributor to update the PR.

## Merge gates

Merge a PR only when every condition below is true:

- The `plugin-review` verdict is `pass`.
- The PR is open and not draft.
- The PR head SHA still matches the SHA that was reviewed, or the newer SHA was produced by the automation's metadata-only remediation and then re-reviewed.
- GitHub reports the PR as mergeable, or the merge queue accepts it without admin bypass.
- Required CI/status checks are complete and successful.
- There is no `CHANGES_REQUESTED` review decision.
- There are no labels indicating the PR must not merge, including `do-not-merge`, `blocked`, `hold`, `needs-human-review`, or equivalent labels.
- There are no maintainer comments that clearly block merging, including phrases such as `do not merge`, `blocked`, `hold`, `needs human review`, or `changes requested`.
- Branch protection permits a normal merge.

Never use administrator privileges, never bypass branch protection, and never merge a PR with verdict `warn` or `fail`.

## Merge command

Use squash merge only. Lock the merge to the reviewed head SHA:

```bash
gh pr merge <number> --squash --delete-branch --match-head-commit <reviewed-head-sha>
```

If the repository requires a merge queue and `gh pr merge` reports that the PR was added to the queue, treat that as a successful handoff and report it.

## Failure handling

- If a PR cannot be reviewed, post a `fail` verdict or a clearly blocked scheduled-task comment with the evidence collected.
- If a PR has only eligible metadata conflicts and the automation can safely resolve them, push the minimal fix, comment on the PR, rerun validation, and continue toward merge when all gates pass.
- If CI is pending, mark the PR as pending and skip merging.
- If merge fails, keep the PR open, include the error in the run summary, and continue with the next PR.
- Continue processing other PRs after one PR fails.
- Keep the final run summary concise: PR number, verdict, merge gate result, and action taken.

## Hard safety constraints

- Do not edit repository files unless a reviewed PR checkout requires temporary local changes or the automation is applying an eligible metadata-only conflict remediation.
- Do not push new commits to contributor branches except for eligible metadata-only conflict remediation. Never force-push.
- Do not create releases.
- Do not publish packages.
- Do not revoke plugins.
- Do not run destructive filesystem commands.
- Do not use `gh pr merge --admin`.
