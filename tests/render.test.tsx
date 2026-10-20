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
  if (path.includes('/commits/abc/check-runs')) return '{"status":"completed","conclusion":"failure"}\n'
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
  await $.command.run({ command: 'prs', args: 'refresh' })

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
