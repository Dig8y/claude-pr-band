import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Checks } from '../types'
import { PR_FIELDS, parsePrs } from './parse'

const prs = atom({ plugin: 'my-prs', key: 'prs' } as const, null)
const isHidden = atom({ plugin: 'my-prs', key: 'isHidden' } as const, false)

const POLL_MS = 60 * 1000
// Bare names first (Linux / cloud); Homebrew paths for a macOS app launched without them on PATH.
const GH = ['gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh']
const GIT = ['git', '/usr/bin/git']

const run = async ($: EngineInterface, bins: string[], args: string[]) => {
  for (const bin of bins) {
    try {
      return await $.process.run([bin, ...args])
    } catch {
      // not found at this path; try the next
    }
  }
  throw new Error(`my-prs: none of ${bins.join(', ')} could be run`)
}

const checksText = (c: Checks) =>
  c.failed > 0 ? `✗ ${c.failed} failing` : c.pending > 0 ? `… ${c.pending} running` : c.passed > 0 ? '✓ checks pass' : 'no checks'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const refresh = async () => {
      const branch = (await run($, GIT, ['branch', '--show-current'])).stdout.trim()
      if (!branch) {
        await update($, prs, () => [])
        return
      }
      const { exitCode, stdout, stderr } = await run($, GH, [
        'pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', PR_FIELDS,
      ])
      if (exitCode !== 0) {
        $.ui.status(`my-prs: gh failed: ${stderr.trim().slice(0, 80)}`)
        return
      }
      const list = parsePrs(stdout)
      await update($, prs, () => list)
    }

    await $.command.register({ name: 'prs', description: "Show or hide this branch's PR above the prompt" })
    void refresh().catch(err => $.ui.status(String(err)))
    $.clock.every(POLL_MS, () => void refresh().catch(err => $.ui.status(String(err))))

    return next(e)
  })

  on('command.run', { command: 'prs' }, async $ => {
    const hidden = await update($, isHidden, h => !h)
    return { text: hidden ? 'PR band hidden.' : 'PR band shown.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, prs)
    if (e.props.hasSurvey || !list || list.length === 0 || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Text, Link, Button } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {list.map(pr => (
          <Box key={pr.url}>
            <Text key="count">
              <Link href={pr.url} label={`#${pr.number}`} />
              {` ${pr.state.toLowerCase()} · ${checksText(pr.checks)}${pr.review ? ` · ${pr.review}` : ''} · `}
              <Text dimColor>{pr.title.length > 70 ? `${pr.title.slice(0, 69)}…` : pr.title}</Text>
              {' '}
            </Text>
            <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
          </Box>
        ))}
      </Box>
    )
  })
}
