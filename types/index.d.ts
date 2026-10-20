export type Checks = { passed: number; failed: number; pending: number }

export type Pr = {
  number: number
  title: string
  url: string
  state: 'OPEN' | 'DRAFT' | 'MERGED' | 'CLOSED'
  review: string
  checks: Checks
  hasConflicts: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'my-prs': { prs: Pr[] | null; isHidden: boolean }
  }
}
