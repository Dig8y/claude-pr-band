import type { Checks, Pr } from '../types'

type Check = { status?: string; conclusion?: string; state?: string | null }
type ListRow = {
  number: number
  title: string
  url: string
  isDraft: boolean
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  reviewDecision: string
  statusCheckRollup: Check[] | null
}

// Shell commands that change which branch is checked out, or what its PR looks like.
const CHANGES_PR = /\bgit\s+(checkout|switch|push)\b|\bgh\s+pr\s+(create|ready|merge|close|reopen)\b/

export const changesPr = (command: string) => CHANGES_PR.test(command)

export const PR_FIELDS = 'number,title,url,isDraft,state,reviewDecision,statusCheckRollup'

const FAILED = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR'])

// CheckRun reports status + conclusion; StatusContext reports state alone.
const outcome = (c: Check): keyof Checks => {
  const result = c.conclusion || c.state || ''
  if (FAILED.has(result)) return 'failed'
  if ((c.status && c.status !== 'COMPLETED') || result === 'PENDING' || result === 'EXPECTED' || result === '') return 'pending'
  return 'passed'
}

const REVIEW: Record<string, string> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes requested',
  REVIEW_REQUIRED: 'review required',
}

export const parsePrs = (stdout: string): Pr[] =>
  (JSON.parse(stdout) as ListRow[]).map(r => {
    const checks: Checks = { passed: 0, failed: 0, pending: 0 }
    for (const c of r.statusCheckRollup ?? []) checks[outcome(c)] += 1
    return {
      number: r.number,
      title: r.title,
      url: r.url,
      state: r.state === 'OPEN' && r.isDraft ? 'DRAFT' : r.state,
      review: REVIEW[r.reviewDecision] ?? '',
      checks,
    }
  })
