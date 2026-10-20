import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Checks, Pr } from '../types'
import { CHECKS_PER_PAGE, changesPr, checkRunsPath, countChecks, pickPr, previewFor, pullsPath, reviewDecision, repoFromRemote, toPr } from './parse'
import type { CheckRunsPage, RestPull } from './parse'

const prs = atom({ plugin: 'my-prs', key: 'prs' } as const, null)
const isHidden = atom({ plugin: 'my-prs', key: 'isHidden' } as const, false)

// A live PR costs four REST calls a refresh, against a 5,000/hour budget shared with
// everything else using the person's GitHub identity.
const POLL_MS = 3 * 60 * 1000
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
  throw new Error(`none of ${bins.join(', ')} could be run`)
}

// Colours follow the app's own PR list: open green, draft grey, merged purple, closed red.
const STATE: Record<Pr['state'], { label: string; color: string }> = {
  OPEN: { label: 'Open', color: 'success' },
  DRAFT: { label: 'Draft', color: 'inactive' },
  MERGED: { label: 'Merged', color: 'merged' },
  CLOSED: { label: 'Closed', color: 'error' },
}

// The icon is drawn as an isolated image, so it can't read theme keys: fixed hex in the same hues.
const ICON_HEX: Record<Pr['state'], string> = {
  OPEN: '#1a7f37',
  DRAFT: '#6e7781',
  MERGED: '#8250df',
  CLOSED: '#cf222e',
}

// Octicons git-pull-request (MIT), 16×16.
const prIcon = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><path fill="${fill}" d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>`

const CONFLICTING = { label: 'Conflicting', color: 'warning' }
const CONFLICTING_HEX = '#9a6700'

const checksBadge = (c: Checks): { text: string; color: string } | null =>
  c.failed > 0 ? { text: `✗ ${c.failed} failing`, color: 'error' }
    : c.pending > 0 ? { text: `● ${c.pending} running`, color: 'warning' }
    : c.passed > 0 ? { text: `✓ ${c.passed} passing`, color: 'success' }
    : null

const ghApi = async ($: EngineInterface, args: string[]) => {
  const { exitCode, stdout, stderr } = await run($, GH, ['api', ...args])
  if (exitCode !== 0) throw new Error(`gh api ${args.at(-1)} failed: ${stderr.trim().slice(0, 80)}`)
  return stdout
}

const fetchChecks = async ($: EngineInterface, repo: string, sha: string) => {
  const page = async (n: number): Promise<CheckRunsPage> =>
    JSON.parse(await ghApi($, [checkRunsPath(repo, sha, n), '--jq', '{total_count, check_runs: [.check_runs[] | {status, conclusion}]}']))
  const first = await page(1)
  const pageCount = Math.ceil(first.total_count / CHECKS_PER_PAGE)
  const rest = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => page(i + 2)))
  return countChecks([first, ...rest].flatMap(p => p.check_runs))
}

const git = async ($: EngineInterface, args: string[]) => {
  const { exitCode, stdout, stderr } = await run($, GIT, args)
  if (exitCode !== 0) throw new Error(`git ${args.join(' ')} failed: ${stderr.trim().slice(0, 80)}`)
  return stdout
}

// Returns what it found, for /prs refresh to report.
const refresh = async ($: EngineInterface): Promise<string> => {
  const branch = (await git($, ['branch', '--show-current'])).trim()
  const remote = (await git($, ['remote', 'get-url', 'origin'])).trim()
  const repo = repoFromRemote(remote)
  if (!branch || !repo) {
    await update($, prs, () => [])
    return branch ? `origin ${remote} is not a GitHub repo.` : 'no branch checked out (detached HEAD).'
  }
  const owner = repo.split('/')[0]!
  const pulls: RestPull[] = JSON.parse(await ghApi($, [pullsPath(repo, owner, branch)]))
  const byNumber = new Map(pulls.map(p => [p.number, p]))
  const list = pickPr(pulls.map(toPr))
  const pr = list[0]
  if (pr && (pr.state === 'OPEN' || pr.state === 'DRAFT')) {
    const sha = byNumber.get(pr.number)!.head.sha
    const [detail, checks, reviews] = await Promise.all([
      ghApi($, [`repos/${repo}/pulls/${pr.number}`, '--jq', '{mergeable}']),
      fetchChecks($, repo, sha),
      ghApi($, [`repos/${repo}/pulls/${pr.number}/reviews?per_page=100`, '--jq', '[.[] | {user: .user.login, state}]']),
    ])
    // mergeable is null while GitHub is still computing it; only a definite false is a conflict.
    pr.hasConflicts = (JSON.parse(detail) as { mergeable: boolean | null }).mergeable === false
    pr.checks = checks
    pr.review = reviewDecision(JSON.parse(reviews))
  }
  await update($, prs, () => list)
  return pr ? `${repo} ${branch}: #${pr.number} (${pr.state.toLowerCase()}).` : `${repo} ${branch}: no PR.`
}

const refreshInBackground = ($: EngineInterface) => {
  refresh($).catch(err => $.ui.status(`my-prs: ${err instanceof Error ? err.message : String(err)}`))
}

export const register: Register = (on, options) => {
  const previewConfig = {
    url: typeof options.previewUrl === 'string' ? options.previewUrl.trim() : '',
    repo: typeof options.previewRepo === 'string' ? options.previewRepo.trim() : '',
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prs',
      description: "Show or hide this branch's PR above the prompt; /prs refresh re-fetches it",
    })
    refreshInBackground($)
    $.clock.every(POLL_MS, () => refreshInBackground($))

    return next(e)
  })

  on('command.run', { command: 'prs' }, async ($, e) => {
    if (e.args.trim() === 'refresh') {
      try {
        return { text: await refresh($) }
      } catch (err) {
        return { text: err instanceof Error ? err.message : String(err) }
      }
    }
    const hidden = await update($, isHidden, h => !h)
    return { text: hidden ? 'PR band hidden.' : 'PR band shown.' }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (changesPr(e.command)) refreshInBackground($)
    return ran
  }).catch(($, e, next) => next(e)) // a failure here never blocks the command

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, prs)
    if (e.props.hasSurvey || !list || list.length === 0 || (await read($, isHidden))) {
      return next(e)
    }

    const els = $.ui.resolve(e)
    const { Box, Text, Link, Button } = els

    const pr = list[0]!
    // Checks, conflicts and review only mean something while the PR can still change.
    const isLive = pr.state === 'OPEN' || pr.state === 'DRAFT'
    const checks = isLive ? checksBadge(pr.checks) : null
    const preview = isLive ? previewFor(previewConfig, pr.url, pr.number) : undefined
    // A conflict is the thing to act on, so it takes the state's place while the PR is live.
    const conflicting = isLive && pr.hasConflicts
    const state = conflicting ? CONFLICTING : STATE[pr.state]
    const iconHex = conflicting ? CONFLICTING_HEX : ICON_HEX[pr.state]

    return (
      <Box flexDirection="row" flexWrap="nowrap" alignItems="center" gap={1}>
        {'Svg' in els
          ? <els.Svg key="icon" source={prIcon(iconHex)} alt={state.label} width={14} height={14} />
          : null}
        <Text key="state" color={state.color}>{state.label}</Text>
        <Box flexShrink={1} minWidth={0}>
          <Text key="title" wrap="truncate-end">
            <Link href={pr.url} label={`#${pr.number} ${pr.title}`} />
          </Text>
        </Box>
        {preview && (
          <Text key="preview" color="subtle">
            <Link href={preview} label="Preview ↗" />
          </Text>
        )}
        <Box flexGrow={1} />
        {checks && <Text key="checks" color={checks.color}>{checks.text}</Text>}
        {isLive && pr.review && <Text key="review" color="subtle">{pr.review}</Text>}
        <Button key="hide" label="Hide" role="dismiss" plain dimColor onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}
