import type { Checks, Pr } from '../types'

// Shell commands that change which branch is checked out, or what its PR looks like.
const CHANGES_PR = /\bgit\s+(checkout|switch|push)\b|\bgh\s+pr\s+(create|ready|merge|close|reopen)\b/

export const changesPr = (command: string) => CHANGES_PR.test(command)

// Everything goes through GitHub's REST API (`gh api`): cloud sessions block GraphQL, which
// `gh pr list --json` and `gh pr view` use.

// `owner/repo` from an origin URL: git@github.com:o/r.git, https://github.com/o/r, or a
// proxy URL whose path ends in /o/r.
export const repoFromRemote = (remote: string): string | undefined => {
  const m = remote.trim().match(/[/:]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/)
  return m ? `${m[1]}/${m[2]}` : undefined
}

export type RestPull = {
  number: number
  title: string
  html_url: string
  state: 'open' | 'closed'
  draft: boolean
  merged_at: string | null
  head: { sha: string }
}

export const pullsPath = (repo: string, owner: string, branch: string) =>
  `repos/${repo}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=all&per_page=10`

const EMPTY_CHECKS: Checks = { passed: 0, failed: 0, pending: 0 }

export const toPr = (p: RestPull): Pr => ({
  number: p.number,
  title: p.title,
  url: p.html_url,
  state: p.merged_at ? 'MERGED' : p.state === 'closed' ? 'CLOSED' : p.draft ? 'DRAFT' : 'OPEN',
  review: '',
  checks: { ...EMPTY_CHECKS },
  hasConflicts: false,
})

const FAILED = new Set(['failure', 'timed_out', 'action_required', 'startup_failure'])
// Runs that neither passed nor failed: skipped by a condition, informational, or cancelled
// (usually superseded by a newer run). Left out of every count.
const UNCOUNTED = new Set(['skipped', 'neutral', 'cancelled', 'stale'])

export type CheckRun = { status: string; conclusion: string | null }
export type CheckRunsPage = { total_count: number; check_runs: CheckRun[] }

export const CHECKS_PER_PAGE = 100

// Each page is addressed by repos/{owner}/{repo}: the `next` link GitHub returns (and
// `gh api --paginate` follows) uses repositories/{id}/..., which cloud sessions' proxy rejects.
export const checkRunsPath = (repo: string, sha: string, page: number) =>
  `repos/${repo}/commits/${sha}/check-runs?per_page=${CHECKS_PER_PAGE}&page=${page}`

export const countChecks = (runs: CheckRun[]): Checks => {
  const checks: Checks = { ...EMPTY_CHECKS }
  for (const c of runs) {
    if (c.status !== 'completed') checks.pending += 1
    else if (UNCOUNTED.has(c.conclusion ?? '')) continue
    else if (FAILED.has(c.conclusion ?? '')) checks.failed += 1
    else checks.passed += 1
  }
  return checks
}

// REST has no reviewDecision: take each reviewer's latest verdict (a dismissal clears it,
// a plain comment doesn't change it). Required-review rules aren't visible here, so "no
// verdict yet" reads as awaiting review.
export const reviewDecision = (reviews: { user: string; state: string }[]): string => {
  const latest = new Map<string, string>()
  for (const r of reviews) {
    if (r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED') latest.set(r.user, r.state)
    else if (r.state === 'DISMISSED') latest.delete(r.user)
  }
  const verdicts = [...latest.values()]
  if (verdicts.includes('CHANGES_REQUESTED')) return 'changes requested'
  if (verdicts.includes('APPROVED')) return 'approved'
  return 'awaiting review'
}

// A branch can carry several PRs (one closed, a newer one open): prefer one that can still
// change, newest first as gh lists them, else the newest.
export const pickPr = (list: Pr[]): Pr[] => {
  const live = list.find(pr => pr.state === 'OPEN' || pr.state === 'DRAFT')
  const pick = live ?? list[0]
  return pick ? [pick] : []
}

export type PreviewConfig = { url: string; repo: string }

// The template comes from the person's settings: {number} is the PR number, and `repo`
// (owner/repo) limits it to one repository's PRs.
export const previewFor = (config: PreviewConfig, prUrl: string, number: number): string | undefined => {
  if (!config.url) return undefined
  if (config.repo && !prUrl.startsWith(`https://github.com/${config.repo}/pull/`)) return undefined
  return config.url.replaceAll('{number}', String(number))
}
