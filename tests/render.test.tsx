import { expect, test } from 'claude-code/testing'

const PULLS = JSON.stringify([
  { number: 9, title: 'old attempt', html_url: 'https://github.com/o/r/pull/9', state: 'closed', draft: false, merged_at: null, head: { sha: 'old' } },
  { number: 7, title: 'Make the band look right', html_url: 'https://github.com/o/r/pull/7', state: 'open', draft: true, merged_at: null, head: { sha: 'abc' } },
])

// Stands in for git and `gh api`, answering by what each call asks for.
const reply = (argv: readonly string[]) => {
  const path = argv.find(a => a.startsWith('repos/')) ?? ''
  if (argv.includes('--show-current')) return 'feature\n'
  if (argv.includes('get-url')) return 'git@github.com:o/r.git\n'
  if (path.includes('/pulls?head=o%3Afeature')) return PULLS
  if (path.endsWith('/pulls/7')) return '{"mergeable":false}'
  if (argv.includes('--paginate')) throw new Error('--paginate follows repositories/{id} links the cloud proxy rejects')
  // 101 runs over two pages; the failure is on page 2, so the badge shows only if page 2 is fetched.
  if (path.endsWith('/commits/abc/check-runs?per_page=100&page=1'))
    return '{"total_count":101,"check_runs":[{"status":"completed","conclusion":"success"}]}'
  if (path.endsWith('/commits/abc/check-runs?per_page=100&page=2'))
    return '{"total_count":101,"check_runs":[{"status":"completed","conclusion":"failure"}]}'
  if (path.endsWith('/pulls/7/reviews?per_page=100')) return '[{"user":"a","state":"CHANGES_REQUESTED"}]'
  throw new Error(`unexpected call: ${argv.join(' ')}`)
}

test('band draws the live PR on desktop and terminal', { options: { previewUrl: 'https://pr-{number}.preview.example', previewRepo: 'o/r' } }, async ($, on) => {
  on('process.run', (_$, e) => ({
    value: { exitCode: 0, stdout: reply(e.argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
  expect(await $.command.run({ command: 'prs', args: 'refresh' })).toEqual({ text: 'o/r feature: #7 (draft).' })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'my-prs', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } as never })
    expect(await ui.find({ type: 'Text', text: /^Conflicting$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^✗ 1 failing$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^changes requested$/ })).toBeDefined()
    expect(await ui.find({ type: 'Link', text: /^#7 Make the band look right$/ })).toBeDefined()
    expect(await ui.find({ type: 'Link', text: /^Preview/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /old attempt/ })).toBeUndefined()
    await ui.press({ key: 'hide' })
    expect(await ui.find({ type: 'Text', text: /^Conflicting$/ })).toBeUndefined()
    await ui.unmount()
    await $.command.run({ command: 'prs', args: '' })
  }
})

test('refresh reports a failing git call instead of showing no PR', async ($, on) => {
  on('process.run', (_$, e) => ({
    value: e.argv.includes('--show-current')
      ? { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository', isStdoutTruncated: false, isStderrTruncated: false }
      : { exitCode: 0, stdout: reply(e.argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  expect(await $.command.run({ command: 'prs', args: 'refresh' }))
    .toEqual({ text: 'git branch --show-current failed: fatal: not a git repository' })
})
