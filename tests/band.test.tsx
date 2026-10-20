import { expect, test } from 'claude-code/testing'

import { changesPr, parsePrs } from '../hooks/parse'

test('refreshes after branch- and PR-changing commands only', () => {
  for (const c of ['git checkout foo', 'git switch -c bar', 'git push -u origin x', 'cd a && gh pr merge 7'])
    expect(changesPr(c)).toBe(true)
  for (const c of ['git status', 'git log', 'gh pr view', 'ls checkout'])
    expect(changesPr(c)).toBe(false)
})

test('summarises state, review and checks from gh pr list', () => {
  const out = JSON.stringify([{
    number: 7, title: 'Fix', url: 'https://github.com/o/r/pull/7', isDraft: true, state: 'OPEN',
    reviewDecision: 'REVIEW_REQUIRED',
    statusCheckRollup: [
      { status: 'COMPLETED', conclusion: 'SUCCESS' },
      { status: 'COMPLETED', conclusion: 'SKIPPED' },
      { status: 'IN_PROGRESS', conclusion: '' },
      { status: 'COMPLETED', conclusion: 'FAILURE' },
      { state: 'PENDING' },
    ],
  }])
  expect(parsePrs(out)).toEqual([{
    number: 7, title: 'Fix', url: 'https://github.com/o/r/pull/7', state: 'DRAFT',
    review: 'review required', checks: { passed: 2, failed: 1, pending: 2 },
  }])
})

test('merged PR with no checks', () => {
  const out = JSON.stringify([{ number: 8, title: 'x', url: 'u', isDraft: false, state: 'MERGED', reviewDecision: 'APPROVED', statusCheckRollup: [] }])
  expect(parsePrs(out)[0]).toMatchObject({ state: 'MERGED', review: 'approved', checks: { passed: 0, failed: 0, pending: 0 } })
})
