<#
.SYNOPSIS
  Opens a pull request for the current branch and enables squash
  auto-merge so the PR lands as soon as required status checks pass.

.DESCRIPTION
  Designed for the solo-maintainer workflow where every change still
  goes through a PR for CI gating, automated review, and clean
  history — without manual reviewer ceremony.

  Steps performed:
    1. Verify the gh CLI is installed and that the working tree is
       clean.
    2. Verify the current branch is not the base branch and has at
       least one commit ahead of it.
    3. Push the current branch to origin with upstream tracking.
    4. Create a pull request via 'gh pr create --fill' (title and
       body come from the last commit).
    5. Enable squash auto-merge with 'gh pr merge --auto --squash
       --delete-branch'.

.PARAMETER Draft
  Open the pull request as a draft. Auto-merge is NOT enabled in this
  mode — mark the PR ready manually when you want it to land.

.PARAMETER Base
  Target branch. Defaults to 'main'.

.EXAMPLE
  ./scripts/new-pr.ps1
  Push the current branch, open a PR against main, enable auto-merge.

.EXAMPLE
  ./scripts/new-pr.ps1 -Draft
  Same, but open as draft.
#>
[CmdletBinding()]
param(
  [switch]$Draft,
  [string]$Base = 'main'
)

$ErrorActionPreference = 'Stop'

function Fail($msg) {
  Write-Error $msg
  exit 1
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Fail "GitHub CLI (gh) is not on PATH. Install from https://cli.github.com/."
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -eq $Base) {
  Fail "You are on '$Base'. Create a feature branch first (e.g., git checkout -b feat/foo)."
}

if (git status --porcelain) {
  Fail "Working tree has uncommitted changes. Commit them first."
}

$ahead = git rev-list --count "$Base..HEAD" 2>$null
if ($LASTEXITCODE -ne 0 -or [int]$ahead -lt 1) {
  Fail "No commits ahead of '$Base' on branch '$branch'."
}

Write-Host "Pushing $branch -> origin..." -ForegroundColor Cyan
git push -u origin $branch
if ($LASTEXITCODE -ne 0) { Fail "git push failed." }

Write-Host "Creating pull request against $Base..." -ForegroundColor Cyan
$createArgs = @('pr', 'create', '--fill', '--base', $Base)
if ($Draft) { $createArgs += '--draft' }
& gh @createArgs
if ($LASTEXITCODE -ne 0) { Fail "gh pr create failed." }

if (-not $Draft) {
  Write-Host "Enabling squash auto-merge..." -ForegroundColor Cyan
  gh pr merge --auto --squash --delete-branch
  if ($LASTEXITCODE -ne 0) { Fail "gh pr merge failed." }
}

$prUrl = (gh pr view --json url --jq '.url').Trim()
Write-Host ""
Write-Host "PR ready: $prUrl" -ForegroundColor Green
if (-not $Draft) {
  Write-Host "Will auto-merge once CI passes." -ForegroundColor Green
} else {
  Write-Host "Draft - mark ready and enable merge when CI passes." -ForegroundColor Yellow
}
