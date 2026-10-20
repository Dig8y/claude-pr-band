import { expect, test } from 'claude-code/testing'

import { changesPr, checkRunsPath, countChecks, pickPr, previewFor, pullsPath, repoFromRemote, reviewDecision, toPr } from '../hooks/parse'

test('refreshes after branch- and PR-changing commands only', () => {
  for (const c of ['git checkout foo', 'git switch -c bar', 'git push -u origin x', 'cd a && gh pr merge 7'])
    expect(changesPr(c)).toBe(true)
  for (const c of ['git status', 'git log', 'gh pr view', 'ls checkout'])
    expect(changesPr(c)).toBe(false)
})

test('reads owner/repo from every origin URL shape', () => {
  expect(repoFromRemote('git@github.com:o/r.git\n')).toBe('o/r')
  expect(repoFromRemote('https://github.com/o/r')).toBe('o/r')
  expect(repoFromRemote('http://local_proxy@127.0.0.1:41234/git/o/r')).toBe('o/r')
  expect(repoFromRemote('')).toBeUndefined()
})

test('lists by head owner:branch, encoded', () => {
  expect(pullsPath('o/r', 'o', 'digby/x')).toBe('repos/o/r/pulls?head=o%3Adigby%2Fx&state=all&per_page=10')
})

test('maps REST state, draft and merge to one state', () => {
  const p = (state: 'open' | 'closed', draft: boolean, merged_at: string | null) =>
    toPr({ number: 1, title: 't', html_url: 'u', state, draft, merged_at, head: { sha: 's' } }).state
  expect(p('open', false, null)).toBe('OPEN')
  expect(p('open', true, null)).toBe('DRAFT')
  expect(p('closed', false, '2026-10-20T00:00:00Z')).toBe('MERGED')
  expect(p('closed', false, null)).toBe('CLOSED')
})

test('counts check runs by status and conclusion', () => {
  const runs = [
    { status: 'completed', conclusion: 'success' },
    { status: 'completed', conclusion: 'skipped' },
    { status: 'in_progress', conclusion: null },
    { status: 'queued', conclusion: null },
    { status: 'completed', conclusion: 'failure' },
    { status: 'completed', conclusion: 'cancelled' },
    { status: 'completed', conclusion: 'neutral' },
  ]
  expect(countChecks(runs)).toEqual({ passed: 1, failed: 1, pending: 2 })
  expect(countChecks([])).toEqual({ passed: 0, failed: 0, pending: 0 })
})

test('addresses every check-runs page by owner/repo, never by numeric repository id', () => {
  expect(checkRunsPath('o/r', 'abc', 2)).toBe('repos/o/r/commits/abc/check-runs?per_page=100&page=2')
})

test('review decision is each reviewer\'s latest verdict', () => {
  expect(reviewDecision([])).toBe('awaiting review')
  expect(reviewDecision([{ user: 'a', state: 'COMMENTED' }])).toBe('awaiting review')
  expect(reviewDecision([{ user: 'a', state: 'CHANGES_REQUESTED' }, { user: 'a', state: 'APPROVED' }])).toBe('approved')
  expect(reviewDecision([{ user: 'a', state: 'APPROVED' }, { user: 'b', state: 'CHANGES_REQUESTED' }])).toBe('changes requested')
  expect(reviewDecision([{ user: 'a', state: 'CHANGES_REQUESTED' }, { user: 'a', state: 'DISMISSED' }])).toBe('awaiting review')
  expect(reviewDecision([{ user: 'a', state: 'APPROVED' }, { user: 'a', state: 'COMMENTED' }])).toBe('approved')
})

test('prefers a live PR over a newer closed one', () => {
  const pr = (number: number, state: 'OPEN' | 'DRAFT' | 'MERGED' | 'CLOSED') =>
    ({ number, title: '', url: `u${number}`, state, review: '', checks: { passed: 0, failed: 0, pending: 0 }, hasConflicts: false })
  expect(pickPr([pr(9, 'CLOSED'), pr(7, 'DRAFT')]).map(p => p.number)).toEqual([7])
  expect(pickPr([pr(9, 'CLOSED'), pr(8, 'MERGED')]).map(p => p.number)).toEqual([9])
  expect(pickPr([])).toEqual([])
})

test('preview link follows the configured template and repo', () => {
  const config = { url: 'https://pr-{number}.preview.example', repo: 'o/r' }
  expect(previewFor(config, 'https://github.com/o/r/pull/7', 7)).toBe('https://pr-7.preview.example')
  expect(previewFor(config, 'https://github.com/o/other/pull/7', 7)).toBeUndefined()
  expect(previewFor({ ...config, repo: '' }, 'https://github.com/o/other/pull/7', 7)).toBe('https://pr-7.preview.example')
  expect(previewFor({ url: '', repo: '' }, 'https://github.com/o/r/pull/7', 7)).toBeUndefined()
})
