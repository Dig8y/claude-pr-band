# my-prs

A Claude Code mod that shows the pull request for the session's current branch in a band above the prompt: its number (linked), state (open, draft, merged, closed), CI checks (failing, running or passing) and review decision. It refreshes every minute. `/prs` or the Hide button toggles it.

Needs `gh` installed and signed in, and `git`, on the machine the session runs on.

## Install

At the prompt of a terminal session:

```
/plugin install my-prs --marketplace Dig8y/claude-pr-band
```

From a shell:

```
claude plugin install my-prs --marketplace Dig8y/claude-pr-band
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `Dig8y/claude-pr-band`, then Add plugin.

This repository is private: installing needs read access on GitHub and a git credential for github.com on your machine (an SSH key, or `gh auth login` then `gh auth setup-git`).
