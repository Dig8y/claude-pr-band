# my-prs

A Claude Code mod that shows the pull request for the session's current branch in a band above the prompt: its number (linked), state (open, draft, merged, closed), CI checks (failing, running or passing) and review decision. It refreshes every 3 minutes, and straight after Claude runs a branch- or PR-changing command; `/prs refresh` refreshes on demand. `/prs` or the Hide button toggles it.

Needs `gh` and `git` on the machine the session runs on. It only uses GitHub's REST API (`gh api`), because cloud sessions block GraphQL, so it works locally and in cloud sessions. An open PR costs four REST calls per refresh.

## Preview link

Set two options to add a "Preview ↗" link to open PRs. Installing asks for them, or add them to `~/.claude/settings.json`:

```json
"pluginConfigs": {
  "my-prs": {
    "previewUrl": "https://pr-{number}.preview.example.com",
    "previewRepo": "owner/repo"
  }
}
```

`{number}` becomes the PR number. `previewRepo` limits the link to that repository's PRs; leave it empty for every repo.

## Install

At the prompt of a terminal session:

```
/plugin install my-prs --marketplace build-technologies/claude-pr-band
```

From a shell:

```
claude plugin install my-prs --marketplace build-technologies/claude-pr-band
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `build-technologies/claude-pr-band`, then Add plugin.

This repository is private: installing needs read access to it on GitHub and a git credential for github.com on your machine (an SSH key, or `gh auth login` then `gh auth setup-git`).
